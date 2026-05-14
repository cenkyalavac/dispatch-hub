// Broker-callable endpoint. Receives a freshly-minted JWT from the external
// broker service (e.g. Railway/Playwright) and upserts it into CachedToken.
// Auth: shared secret header X-Broker-Key must match BROKER_KEY env var.
// No user auth — broker runs without a Base44 user context.
//
// Implementation note: we use createClientFromRequest because that is the only
// init that gives us a working asServiceRole inside Base44's runtime (the
// platform injects the service token via the request context). We never call
// base44.auth.me() here, so the user-lookup 401 logs do not get triggered —
// authorization is solely the BROKER_KEY shared-secret check below.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    // 1) Auth check — shared secret with the broker
    const expected = Deno.env.get('BROKER_KEY');
    const got = req.headers.get('x-broker-key');
    if (!expected || !got || got !== expected) {
      return Response.json({ error: 'invalid broker key' }, { status: 401 });
    }

    // 2) Validate body
    const body = await req.json().catch(() => ({}));
    const { key, token_value, expires_at, scope } = body || {};
    if (!key || !token_value || !expires_at) {
      return Response.json(
        { error: 'missing required fields: key, token_value, expires_at' },
        { status: 400 }
      );
    }

    // 3) Service-role client from the request context (no auth.me() call → no
    //    spurious "Authentication required to view users" errors).
    const base44 = createClientFromRequest(req);

    // 4) Upsert by key
    const existing = await base44.asServiceRole.entities.CachedToken.filter({ key });
    const now = new Date().toISOString();
    const payload = {
      key,
      token_value,
      expires_at,
      scope: scope || '',
      last_pushed_at: now,
    };

    let result;
    let action;
    if (existing && existing.length > 0) {
      result = await base44.asServiceRole.entities.CachedToken.update(existing[0].id, payload);
      action = 'updated';
    } else {
      result = await base44.asServiceRole.entities.CachedToken.create(payload);
      action = 'created';
    }

    console.log(`[updateCachedToken] action=${action} key=${key} expires_at=${expires_at}`);

    return Response.json({
      ok: true,
      key,
      expires_at,
      id: result.id,
      action,
    });
  } catch (error) {
    console.error('[updateCachedToken] error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});