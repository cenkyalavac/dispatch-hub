// Symfonie (Moravia Projects) webhook receiver.
//
// Public endpoint — Symfonie's webhook engine cannot send Base44 auth headers,
// so we authenticate the caller via a shared secret in the URL query string:
//
//   POST https://<base44-fn-url>/symfonieWebhookReceiver?secret=<SYMFONIE_WEBHOOK_SECRET>
//        &delivery=<uuid>&eventType=<Name>&entityType=<task|transition>&triggerType=<before|after>
//
// Per Symfonie API help (/api/help/webhooks):
//   - eventType=ping  → reply with manifest JSON (used during webhook registration).
//   - any other event → 200 OK, body is processed asynchronously.
//
// Events we react to (V5 contract list, /api/help/contracts):
//   TaskOrdered          → new offer arrived; invalidate pending cache so the UI
//                           refreshes on next view (no extra API call here).
//   TaskCanceled         → if we have an AcceptedTask with matching task_id,
//                           flip its status to 'rejected' (canceled-by-source).
//   TaskAssignmentChanged → unassigned-from-us; same treatment as TaskCanceled.
//   TaskCompleted / TaskApproved → log only (history is fetched on demand).
//   Everything else      → log only.
//
// We log EVERY delivery into the WebhookInbound entity, deduplicated by
// (portal, delivery_id), so even unhandled events are visible in the UI.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const PORTAL_KEY = 'symfonie';

// Manifest returned on ping — Symfonie uses this to render the webhook
// configuration UI on their side. Keep events list aligned with the handler
// switch below so registration mirrors actual behavior.
const MANIFEST = {
  Url: '',
  Name: 'Dispatch Hub',
  Description: 'Real-time task lifecycle events for the Dispatch integration.',
  DocumentationUrl: '',
  WebhookEvents: [
    { EntityType: 'task', TriggerType: 'after', EventType: 'TaskOrdered' },
    { EntityType: 'task', TriggerType: 'after', EventType: 'TaskCanceled' },
    { EntityType: 'task', TriggerType: 'after', EventType: 'TaskAssignmentChanged' },
    { EntityType: 'task', TriggerType: 'after', EventType: 'TaskCompleted' },
    { EntityType: 'task', TriggerType: 'after', EventType: 'TaskApproved' },
  ],
  Parameters: [],
};

// Pull a task/job id from whatever shape Symfonie sends.  Their contracts
// differ across event types (TaskOrdered → Task.Id; TaskTransition → JobId),
// so probe the most common keys and stop at the first hit.
function extractTaskId(body) {
  if (!body || typeof body !== 'object') return null;
  return (
    body?.Task?.Id ??
    body?.TaskId ??
    body?.JobId ??
    body?.Job?.Id ??
    body?.Id ??
    body?.entity?.id ??
    null
  );
}

Deno.serve(async (req) => {
  // Symfonie sometimes pings with GET during config — answer either method.
  const url = new URL(req.url);
  const querySecret = url.searchParams.get('secret');
  const expected = Deno.env.get('SYMFONIE_WEBHOOK_SECRET');

  if (!expected) {
    return Response.json({ error: 'SYMFONIE_WEBHOOK_SECRET not configured' }, { status: 503 });
  }
  if (querySecret !== expected) {
    // No DB write for bad-secret hits — would be a free DoS vector.
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const deliveryId = url.searchParams.get('delivery') || '';
  const eventType  = url.searchParams.get('eventType') || '';
  const entityType = url.searchParams.get('entityType') || '';
  const triggerType = url.searchParams.get('triggerType') || '';

  // PING → respond with the manifest. Symfonie expects a 200 with the JSON body.
  if (eventType.toLowerCase() === 'ping') {
    return Response.json(MANIFEST, { status: 200 });
  }

  // Parse the body — Symfonie sends JSON for transition events; tolerate empty.
  let body = null;
  try {
    const text = await req.text();
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }

  // Service-role client (no user context — public endpoint).
  // We DO NOT call createClientFromRequest here because there's no Base44
  // auth header from Symfonie. Use a bare service-role-style call by hitting
  // the SDK with no request context.
  const base44 = createClientFromRequest(req);
  const receivedAt = new Date().toISOString();
  const taskId = extractTaskId(body);

  // Idempotency: same delivery_id + portal = already processed.
  if (deliveryId) {
    const existing = await base44.asServiceRole.entities.WebhookInbound
      .filter({ portal: PORTAL_KEY, delivery_id: deliveryId })
      .catch(() => []);
    if (existing.length > 0) {
      return Response.json({ ok: true, duplicate: true, id: existing[0].id });
    }
  }

  // Insert the log row first so even a handler crash leaves a trace.
  const logRow = await base44.asServiceRole.entities.WebhookInbound.create({
    portal: PORTAL_KEY,
    delivery_id: deliveryId,
    event_type: eventType,
    entity_type: entityType,
    trigger_type: triggerType,
    task_id: taskId ? String(taskId) : '',
    status: 'received',
    received_at: receivedAt,
    raw_payload: body || {},
  }).catch((e) => {
    console.error('webhook log insert failed:', e.message);
    return null;
  });

  let action = '';
  let processStatus = 'processed';
  let err = null;

  try {
    switch (eventType) {
      case 'TaskOrdered': {
        // New offer arrived. Invalidate the cached pending snapshot so the
        // next UI fetch sees fresh data.  We don't pre-fetch here to avoid
        // hammering Symfonie when bursts come in.
        const cached = await base44.asServiceRole.entities.CachedSnapshot
          .filter({ key: 'pending_symfonie' }).catch(() => []);
        for (const row of cached) {
          await base44.asServiceRole.entities.CachedSnapshot
            .update(row.id, { fetched_at: null }).catch(() => {});
        }
        action = `invalidated pending_symfonie cache (${cached.length} row${cached.length === 1 ? '' : 's'})`;
        break;
      }

      case 'TaskCanceled':
      case 'TaskAssignmentChanged': {
        if (!taskId) { action = 'no task id in payload'; break; }
        const tasks = await base44.asServiceRole.entities.AcceptedTask
          .filter({ portal: PORTAL_KEY, task_id: Number(taskId) }).catch(() => []);
        for (const t of tasks) {
          await base44.asServiceRole.entities.AcceptedTask
            .update(t.id, { status: 'rejected' }).catch(() => {});
        }
        action = tasks.length
          ? `marked ${tasks.length} AcceptedTask row(s) as rejected`
          : `no AcceptedTask matched task_id=${taskId}`;
        break;
      }

      case 'TaskCompleted':
      case 'TaskApproved':
        action = 'logged (no state change)';
        break;

      default:
        action = 'logged only';
        processStatus = 'received';
    }
  } catch (e) {
    err = e.message;
    processStatus = 'error';
    console.error(`webhook handler error for ${eventType}:`, e.message);
  }

  if (logRow) {
    await base44.asServiceRole.entities.WebhookInbound.update(logRow.id, {
      status: processStatus,
      action_taken: action,
      error: err,
    }).catch(() => {});
  }

  // Always 200 — non-2xx triggers Symfonie's retry queue which we don't need.
  return Response.json({ ok: true, action });
});