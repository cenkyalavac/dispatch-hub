// Fetches the 12-band TM leverage breakdown for a single submission.
// Called from the /globallink/pending UI when the user opens a row's detail.
// Persists the result back to GlobalLinkSubmission.leverage so subsequent
// opens are instant.
//
// PD calls go through broker /proxy/pd.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

async function pdProxy(brokerUrl, brokerKey, endpoint, body) {
  const res = await fetch(`${brokerUrl}/proxy/pd`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${brokerKey}` },
    body: JSON.stringify({ endpoint, body }),
  });
  const text = await res.text();
  let payload;
  try { payload = JSON.parse(text); } catch { payload = { error: text.slice(0, 200) }; }
  if (!res.ok) throw new Error(`Broker proxy HTTP ${res.status}: ${payload?.error || text.slice(0, 200)}`);
  return { status: payload?.status ?? 200, body: payload?.body ?? payload };
}

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

    const brokerUrl = (Deno.env.get('BROKER_URL') || '').replace(/\/$/, '');
    const brokerKey = Deno.env.get('BROKER_KEY');
    if (!brokerUrl || !brokerKey) {
      return Response.json({ success: false, error: 'BROKER_URL or BROKER_KEY secret missing' }, { status: 503 });
    }

    const { status, body: pdBody } = await pdProxy(brokerUrl, brokerKey, 'submissionView.pd', {
      classifier: 'Batch1',
      folder: 'AVAILABLE_SUBMISSION',
      submissionTicket: submission_ticket,
      sourceLanguageComboBox: (source_language || 'tr-tr').toLowerCase(),
    });

    // 403 "Permission Violation" → vendor hasn't claimed this submission yet,
    // TP refuses submissionView. Not a true error.
    if (status === 403) {
      return Response.json({ success: true, leverage: null, skipped: 'permission_violation' });
    }
    if (status >= 400) {
      return Response.json({ success: false, error: `submissionView.pd HTTP ${status}: ${pdBody?.description || JSON.stringify(pdBody).slice(0, 200)}` }, { status });
    }

    const leverage = pdBody?.additionalData?.cumulativeTmStatistics || pdBody?.additionalData || null;

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