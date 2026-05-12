// Internal — fires a project lifecycle event to all matching WebhookSubscription targets.
// Payload: { tenant_id, event, project_id }
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

async function hmacSha256(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { tenant_id = 'default', event, project_id } = await req.json();
    if (!event || !project_id) {
      return Response.json({ error: 'event and project_id are required' }, { status: 400 });
    }

    const project = await base44.asServiceRole.entities.Project.get(project_id).catch(() => null);
    if (!project) return Response.json({ error: 'project not found' }, { status: 404 });

    const subs = await base44.asServiceRole.entities.WebhookSubscription.filter({
      tenant_id,
      is_active: true,
    });

    const matching = subs.filter(s => !s.events || s.events.length === 0 || s.events.includes(event));
    if (matching.length === 0) {
      return Response.json({ delivered: 0, reason: 'no matching subscriptions' });
    }

    const payload = {
      event,
      delivered_at: new Date().toISOString(),
      project: {
        id: project.id,
        external_id: project.external_id,
        state: project.state,
        portal: project.portal,
        name: project.name,
        source_language: project.source_language,
        target_language: project.target_language,
        word_count: project.word_count,
        price: project.price,
        currency: project.currency,
        due_date: project.due_date,
        accepted_at: project.accepted_at,
        acknowledged_at: project.acknowledged_at,
        delivered_at: project.delivered_at,
      },
    };
    const body = JSON.stringify(payload);

    const results = await Promise.allSettled(matching.map(async (sub) => {
      const headers = { 'Content-Type': 'application/json', 'X-Dispatch-Event': event };
      if (sub.secret) {
        headers['X-Dispatch-Signature'] = 'sha256=' + await hmacSha256(sub.secret, body);
      }

      const log = {
        subscription_id: sub.id, tenant_id, event,
        project_id: project.id, url: sub.url, payload, attempt: 1,
      };

      try {
        const r = await fetch(sub.url, { method: 'POST', headers, body });
        const txt = await r.text().catch(() => '');
        const status = r.ok ? 'success' : 'failed';
        await base44.asServiceRole.entities.WebhookDelivery.create({
          ...log, status, http_status: r.status,
          response_excerpt: txt.slice(0, 500),
          delivered_at: new Date().toISOString(),
        });
        await base44.asServiceRole.entities.WebhookSubscription.update(sub.id, {
          last_delivered_at: new Date().toISOString(),
          last_status: `${r.status}`,
        });
        return { sub: sub.id, ok: r.ok, status: r.status };
      } catch (e) {
        await base44.asServiceRole.entities.WebhookDelivery.create({
          ...log, status: 'failed', error: e.message,
          delivered_at: new Date().toISOString(),
        });
        return { sub: sub.id, ok: false, error: e.message };
      }
    }));

    return Response.json({
      delivered: results.filter(r => r.status === 'fulfilled' && r.value.ok).length,
      total: results.length,
    });
  } catch (error) {
    console.error('dispatchWebhook error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});