// Fetches the 12-band TM leverage breakdown for a single submission.
// Called from the /globallink/pending UI when the user opens a row's detail.
// Persists the result back to GlobalLinkSubmission.leverage so subsequent
// opens are instant.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const DEFAULT_BASE = 'https://gle-prod-eu.transperfect.com/PD';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (user !== null && user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { submission_ticket, source_language } = body || {};
    if (!submission_ticket) {
      return Response.json({ success: false, error: 'submission_ticket is required' }, { status: 400 });
    }

    // Get JWT via cache helper
    const tokenRes = await base44.asServiceRole.functions.invoke('getGlobalLinkToken', {});
    if (!tokenRes?.data?.token_value) {
      return Response.json({ success: false, error: tokenRes?.data?.error || 'No cached GlobalLink JWT available' }, { status: 503 });
    }
    const jwt = tokenRes.data.token_value;

    const contextUser = Deno.env.get('GLOBALLINK_CONTEXT_USER') || 'VerbatoTrans';
    const base = (Deno.env.get('GLOBALLINK_BASE_URL') || DEFAULT_BASE).replace(/\/$/, '');

    const res = await fetch(`${base}/submissionView.pd`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwt}`,
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        'ajaxRequest': 'true',
        'appVersion': '11.5.0',
        'contextUser': contextUser,
      },
      body: JSON.stringify({
        classifier: 'Batch1',
        folder: 'AVAILABLE_SUBMISSION',
        submissionTicket: submission_ticket,
        sourceLanguageComboBox: (source_language || 'tr-tr').toLowerCase(),
      }),
    });

    // 403 "Permission Violation" → vendor hasn't claimed this submission yet,
    // TP refuses submissionView. Not a true error; return null leverage so the
    // UI can show "leverage unavailable until claimed".
    if (res.status === 403) {
      return Response.json({ success: true, leverage: null, skipped: 'permission_violation' });
    }
    if (!res.ok) {
      const text = await res.text();
      return Response.json({ success: false, error: `submissionView.pd HTTP ${res.status}: ${text.slice(0, 200)}` }, { status: res.status });
    }
    const data = await res.json();
    const leverage = data?.additionalData?.cumulativeTmStatistics || data?.additionalData || null;

    // Persist back if we can identify the row(s) for this submission.
    const rows = await base44.asServiceRole.entities.GlobalLinkSubmission.filter({ submission_ticket });
    const fetchedAt = new Date().toISOString();
    for (const row of rows) {
      try {
        await base44.asServiceRole.entities.GlobalLinkSubmission.update(row.id, {
          leverage,
          leverage_fetched_at: fetchedAt,
        });
      } catch (e) {
        console.error('Leverage persist failed:', e.message);
      }
    }

    return Response.json({ success: true, leverage, fetched_at: fetchedAt });
  } catch (error) {
    console.error('globallinkLeverage error:', error.message);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});