// Reject a Junction offer. Mirror of junctionAcceptOffer but calls
// PUT /v1/offer/{offerId}/reject. Writes an AcceptedTask row with
// status='rejected' for auditing; does NOT create a Project or fire a webhook.
//
// Reject reason payload format was reverse-engineered from the live UI by
// junctionProcessOffers — `{ reasons: [{ reasonCategory, reasonExplanation }] }`,
// NOT the doc's `{ reason: "..." }`. The doc is wrong on this point.
// "capacity" is the safest automated default — no extra context demanded.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const PROD_BASE = 'https://hypnos.welocalize.tools';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // task_id here is the Junction OFFER ID (legacy parameter name — matches
    // the jenerik PendingTab payload contract used by every other portal).
    const body = await req.json();
    const {
      task_id, task_name, project_name, client_name, account_name,
      source_language, target_language, word_count, price, due_date,
      reason_category = 'capacity', reason_explanation = null,
    } = body;
    if (!task_id) return Response.json({ success: false, error: 'task_id is required' }, { status: 400 });
    const offerId = Number(task_id);
    const resolvedClient = client_name || account_name || '';

    // Kill switch — paused connector must not reject either.
    const portalRows = await base44.asServiceRole.entities.Portal.filter({ key: 'junction' });
    if (portalRows[0]?.is_active === false) {
      return Response.json({ success: false, error: 'Junction connector is paused' }, { status: 409 });
    }

    const jwt = Deno.env.get('JUNCTION_JWT');
    const apiKey = Deno.env.get('JUNCTION_API_KEY');
    if (!jwt) return Response.json({ success: false, error: 'JUNCTION_JWT not configured' }, { status: 503 });

    const headers = { 'x-pantheon-auth': jwt, 'Content-Type': 'application/json' };
    if (apiKey) headers['x-api-key'] = apiKey;

    // Rate-limit aware retry — same exponential backoff as accept (429/5xx
    // → up to 3 retries, capped 8s).
    const rejectUrl = `${PROD_BASE}/v1/offer/${offerId}/reject`;
    const rejectBody = JSON.stringify({
      reasons: [{ reasonCategory: reason_category, reasonExplanation: reason_explanation }],
    });
    let r;
    for (let attempt = 0; attempt <= 3; attempt++) {
      r = await fetch(rejectUrl, { method: 'PUT', headers, body: rejectBody });
      if (r.ok) break;
      if (![429, 502, 503, 504].includes(r.status) || attempt === 3) break;
      await new Promise((res) => setTimeout(res, Math.min(1000 * 2 ** attempt, 8000)));
    }

    if (!r.ok) {
      const text = await r.text();
      let hint = '';
      if (r.status === 401) hint = 'Junction JWT expired or invalid — refresh JUNCTION_JWT.';
      else if (r.status === 404) hint = 'Offer not found — may already be resolved.';
      else if (r.status === 429) hint = 'Junction rate limit hit — retried 3× and gave up.';
      return Response.json(
        { success: false, error: `Junction HTTP ${r.status}: ${hint || text.slice(0, 200)}` },
        { status: 502 }
      );
    }

    const rejectedAt = new Date().toISOString();
    await base44.asServiceRole.entities.AcceptedTask.create({
      portal: 'junction',
      task_id: offerId,
      task_name: task_name || `Offer #${task_id}`,
      project_name: project_name || '',
      client_name: resolvedClient,
      source_language: source_language || '',
      target_language: target_language || '',
      word_count: word_count || 0,
      price: price || 0,
      due_date: due_date || null,
      accepted_at: rejectedAt,
      matched_rule: 'Manual',
      status: 'rejected',
      sheets_synced: false,
    });

    console.log(`Junction offer ${offerId} manually rejected by ${user?.email || 'user'} (reason: ${reason_category})`);
    return Response.json({ success: true, rejected_at: rejectedAt });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});