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
    headers: { 'Content-Type': 'application/json', 'X-Broker-Key': brokerKey },
    body: JSON.stringify({ endpoint, body }),
  });
  const text = await res.text();
  let payload;
  try { payload = JSON.parse(text); } catch { payload = { error: text.slice(0, 200) }; }
  if (!res.ok) throw new Error(`Broker proxy HTTP ${res.status}: ${payload?.error || text.slice(0, 200)}`);
  // Broker envelope evolved to { status, bodyJson, bodyText, ... } — keep
  // backwards compat with older { status, body } shape.
  return { status: payload?.status ?? 200, body: payload?.bodyJson ?? payload?.body ?? payload };
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
    // TP refuses submissionView. Mark the rows so the UI stops asking.
    const fetchedAt = new Date().toISOString();
    const rows = await base44.asServiceRole.entities.GlobalLinkSubmission.filter({ submission_ticket });

    if (status === 403) {
      for (const row of rows) {
        await base44.asServiceRole.entities.GlobalLinkSubmission.update(row.id, {
          leverage: { _unavailable: true, reason: 'permission_violation' },
          leverage_fetched_at: fetchedAt,
        }).catch((e) => console.error('Leverage permission-violation persist failed:', e.message));
      }
      return Response.json({ success: true, leverage: null, skipped: 'permission_violation' });
    }
    if (status >= 400) {
      return Response.json({ success: false, error: `submissionView.pd HTTP ${status}: ${pdBody?.description || JSON.stringify(pdBody).slice(0, 200)}` }, { status });
    }

    // TP returns 200 with success:false + errorCode:CZCOOP ("Application error")
    // when the caller isn't allowed to view this submission (i.e. not the claimant).
    // Treat that the same as a 403.
    const tpFailed = pdBody?.success === false;
    const tmStats = pdBody?.additionalData?.cumulativeTmStatistics || null;
    const leverage = tmStats || { _unavailable: true, reason: tpFailed ? 'view_forbidden' : 'no_tm_statistics' };

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

    return Response.json({ success: true, leverage: tmStats, fetched_at: fetchedAt });
  } catch (error) {
    console.error('globallinkLeverage error:', error.message);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});