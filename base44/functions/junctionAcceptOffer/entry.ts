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

    const { task_id, task_name, project_name, client_name, account_name, source_language, target_language, word_count, price, due_date } = await req.json();
    if (!task_id) return Response.json({ success: false, error: 'task_id is required' }, { status: 400 });
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

    const r = await fetch(`${apiBase}/v1/offer/accept-bulk`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ ids: [Number(task_id)] }),
    });

    if (!r.ok) {
      const text = await r.text();
      return Response.json(
        { success: false, error: `Junction returned HTTP ${r.status}: ${text.slice(0, 200)}` },
        { status: 502 }
      );
    }

    const acceptedAt = new Date().toISOString();

    const savedTask = await base44.asServiceRole.entities.AcceptedTask.create({
      portal: 'junction',
      task_id: Number(task_id),
      task_name: task_name || `Offer #${task_id}`,
      project_name: project_name || '',
      client_name: resolvedClient,
      source_language: source_language || '',
      target_language: target_language || '',
      word_count: word_count || 0,
      price: price || 0,
      due_date: due_date || null,
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
        external_id: `junction:${task_id}`,
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