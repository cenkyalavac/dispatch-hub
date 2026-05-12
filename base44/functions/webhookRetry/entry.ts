// Background retry for failed webhook deliveries.
// Picks up `failed` deliveries whose `next_retry_at` is in the past, re-POSTs once, and
// schedules the next retry with exponential backoff. Caps at 5 attempts.
// Can be called by:
//   • Scheduled automation (no payload) — sweep all due retries (admin guard skipped on system calls).
//   • Manual UI retry — { delivery_id } to retry a single delivery immediately (admin only).
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const MAX_ATTEMPTS = 5;
// Backoff schedule: 1m, 5m, 15m, 1h, 6h. Past attempt 5 → give up.
const BACKOFF_MINUTES = [1, 5, 15, 60, 360];

async function hmacSha256(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function attemptDelivery(base44, delivery) {
  // Re-load subscription so we always honour the latest URL/secret/is_active.
  const sub = await base44.asServiceRole.entities.WebhookSubscription
    .get(delivery.subscription_id).catch(() => null);

  if (!sub || !sub.is_active) {
    await base44.asServiceRole.entities.WebhookDelivery.update(delivery.id, {
      status: 'failed',
      error: sub ? 'Subscription paused' : 'Subscription deleted',
      next_retry_at: null,
    });
    return { ok: false, reason: 'subscription_inactive' };
  }

  const body = JSON.stringify(delivery.payload || {});
  const headers = { 'Content-Type': 'application/json', 'X-Dispatch-Event': delivery.event };
  if (sub.secret) {
    headers['X-Dispatch-Signature'] = 'sha256=' + await hmacSha256(sub.secret, body);
  }

  const nextAttempt = (delivery.attempt || 1) + 1;
  let httpStatus = null, responseText = '', errorMsg = null, ok = false;
  try {
    const r = await fetch(sub.url, { method: 'POST', headers, body });
    httpStatus = r.status;
    responseText = (await r.text().catch(() => '')).slice(0, 500);
    ok = r.ok;
  } catch (e) {
    errorMsg = e.message;
  }

  const now = new Date().toISOString();
  if (ok) {
    await base44.asServiceRole.entities.WebhookDelivery.update(delivery.id, {
      status: 'success',
      http_status: httpStatus,
      response_excerpt: responseText,
      error: null,
      attempt: nextAttempt,
      delivered_at: now,
      next_retry_at: null,
    });
    await base44.asServiceRole.entities.WebhookSubscription.update(sub.id, {
      last_delivered_at: now, last_status: `${httpStatus}`,
    });
    return { ok: true, attempt: nextAttempt };
  }

  // Failed — schedule next retry or give up.
  const giveUp = nextAttempt >= MAX_ATTEMPTS;
  const nextDelayMin = giveUp ? null : BACKOFF_MINUTES[Math.min(nextAttempt - 1, BACKOFF_MINUTES.length - 1)];
  const nextRetryAt = nextDelayMin ? new Date(Date.now() + nextDelayMin * 60_000).toISOString() : null;

  await base44.asServiceRole.entities.WebhookDelivery.update(delivery.id, {
    status: giveUp ? 'failed' : 'retry_scheduled',
    http_status: httpStatus,
    response_excerpt: responseText,
    error: errorMsg || (httpStatus ? `HTTP ${httpStatus}` : 'unknown'),
    attempt: nextAttempt,
    delivered_at: now,
    next_retry_at: nextRetryAt,
  });
  await base44.asServiceRole.entities.WebhookSubscription.update(sub.id, {
    last_status: errorMsg || `HTTP ${httpStatus || 'err'}`,
  });
  return { ok: false, attempt: nextAttempt, gaveUp: giveUp, nextRetryAt };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    const body = await req.json().catch(() => ({}));

    // Manual single retry — requires admin.
    if (body.delivery_id) {
      if (!user || user.role !== 'admin') {
        return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
      }
      const delivery = await base44.asServiceRole.entities.WebhookDelivery.get(body.delivery_id).catch(() => null);
      if (!delivery) return Response.json({ error: 'Delivery not found' }, { status: 404 });
      const result = await attemptDelivery(base44, delivery);
      return Response.json({ success: true, result });
    }

    // Scheduled sweep — system or admin.
    if (user !== null && user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const nowIso = new Date().toISOString();
    // All deliveries whose retry is due. The platform doesn't support $lte well across all backends —
    // we filter by status and check timestamp client-side. Volume is low (failed deliveries only).
    const candidates = await base44.asServiceRole.entities.WebhookDelivery.filter(
      { status: 'retry_scheduled' }, '-created_date', 200
    );
    const due = candidates.filter(d => !d.next_retry_at || d.next_retry_at <= nowIso);

    let retried = 0, recovered = 0, stillFailed = 0, gaveUp = 0;
    for (const d of due) {
      const r = await attemptDelivery(base44, d);
      retried++;
      if (r.ok) recovered++;
      else if (r.gaveUp) gaveUp++;
      else stillFailed++;
    }

    return Response.json({
      success: true,
      summary: { candidates: candidates.length, due: due.length, retried, recovered, stillFailed, gaveUp },
    });
  } catch (error) {
    console.error('webhookRetry error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});