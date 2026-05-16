import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const PROD_BASE = 'https://hypnos.welocalize.tools';

// Sheet write is delegated to `sheetsSyncPending` (fire-and-forget). It owns
// SheetColumnMapping + SheetRoute resolution — duplicating it inline silently
// ignored per-portal column config and hardcoded the wrong tab name ("Sayfa1").

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // .catch(() => null) — Base44 SDK throws on missing session in public apps;
    // matches the pattern used by symfonieAcceptTask/Reject and other write endpoints.
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // NOTE on parameter naming: the frontend sends `task_id` for legacy reasons,
    // but the value is actually the Junction OFFER ID (`o.id` from /v2/offer/me),
    // which is what `/v1/offer/accept-bulk` expects. The Welocalize docs use
    // "task ids" loosely — endpoint is offer-scoped, so offer IDs are correct.
    const { task_id, task_name, project_name, client_name, account_name, source_language, target_language, word_count, price, due_date, workflow_name } = await req.json();
    if (!task_id) return Response.json({ success: false, error: 'task_id is required' }, { status: 400 });
    const offerId = Number(task_id);
    const resolvedClient = client_name || account_name || '';

    // Kill switch: paused connector must not be bypassed by manual accept.
    const portalRows = await base44.asServiceRole.entities.Portal.filter({ key: 'junction' });
    if (portalRows[0]?.is_active === false) {
      return Response.json({ success: false, error: 'Junction connector is paused' }, { status: 409 });
    }

    const jwt = Deno.env.get('JUNCTION_JWT');
    const apiKey = Deno.env.get('JUNCTION_API_KEY');
    const apiBase = PROD_BASE;
    // 503 (Service Unavailable) is the correct status for "we can't reach the
    // upstream because we're not configured" — 200-with-error was masking real
    // failures in the UI's success-detection.
    if (!jwt) return Response.json({ success: false, error: 'JUNCTION_JWT not configured' }, { status: 503 });

    // Defensive: send x-api-key when configured (Welocalize UI sends it; not yet enforced).
    const headers = { 'x-pantheon-auth': jwt, 'Content-Type': 'application/json' };
    if (apiKey) headers['x-api-key'] = apiKey;

    // Rate-limit aware retry — Junction default budget is 500/min but bulk-accept
    // can be hammered when the user clicks Accept on a list of 20+ offers in
    // quick succession. 429/5xx → exponential backoff (capped 8s, max 3 retries).
    const acceptUrl = `${apiBase}/v1/offer/accept-bulk`;
    const body = JSON.stringify({ ids: [offerId] });
    let r;
    for (let attempt = 0; attempt <= 3; attempt++) {
      r = await fetch(acceptUrl, { method: 'PUT', headers, body });
      if (r.ok) break;
      if (![429, 502, 503, 504].includes(r.status) || attempt === 3) break;
      await new Promise((res) => setTimeout(res, Math.min(1000 * 2 ** attempt, 8000)));
    }

    if (!r.ok) {
      const text = await r.text();
      // Map Junction's status codes to actionable messages. 401 means the JWT
      // expired (Junction tokens are session-bound, observed multi-day life);
      // 404 means the offer was claimed by someone else (race-condition on
      // /v2/offer/available pool) or never existed; 429 surfaces the
      // 10-req/10-sec cap on the offer-available endpoint family.
      let hint = '';
      if (r.status === 401) hint = 'Junction JWT expired or invalid — refresh JUNCTION_JWT.';
      else if (r.status === 404) hint = 'Offer not found — may have been claimed by another vendor.';
      else if (r.status === 429) hint = 'Junction rate limit hit — retried 3× and gave up.';
      return Response.json(
        { success: false, error: `Junction HTTP ${r.status}: ${hint || text.slice(0, 200)}` },
        { status: 502 }
      );
    }

    const acceptedAt = new Date().toISOString();

    const savedTask = await base44.asServiceRole.entities.AcceptedTask.create({
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
      workflow_name: workflow_name || '',
      accepted_at: acceptedAt,
      matched_rule: 'Manual',
      status: 'accepted',
      sheets_synced: false,
    });

    // BMS Integration: project record for downstream BMS consumption.
    let project = null;
    try {
      project = await base44.asServiceRole.entities.Project.create({
        tenant_id: 'default',
        accepted_task_id: savedTask.id,
        portal: 'junction',
        external_id: `junction:${offerId}`,
        state: 'accepted',
        name: task_name || `Offer #${task_id}`,
        client_name: resolvedClient,
        project_name: project_name || '',
        source_language: source_language || '',
        target_language: target_language || '',
        word_count: word_count || 0,
        price: price || 0,
        currency: 'USD',
        due_date: due_date || null,
        accepted_at: acceptedAt,
        origin: { task_id, task_name, project_name, client_name: resolvedClient, source_language, target_language, word_count, price, due_date },
      });
      base44.asServiceRole.functions.invoke('dispatchWebhook', {
        tenant_id: 'default', event: 'project.accepted', project_id: project.id,
      }).catch((e) => console.error('webhook dispatch failed:', e.message));
    } catch (e) {
      console.error('Project create failed:', e.message);
    }

    // Trigger the unified sheet sync (handles SheetColumnMapping + SheetRoute).
    base44.asServiceRole.functions.invoke('sheetsSyncPending', {})
      .catch((e) => console.error('sheetsSyncPending trigger failed:', e.message));

    return Response.json({ success: true, accepted_at: acceptedAt, project_id: project?.id || null, sheets_sync: 'queued' });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});