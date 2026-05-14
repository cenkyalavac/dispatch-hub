// Broker-callable endpoint. Receives a freshly-minted JWT from the external
// broker service (e.g. Railway/Playwright) and upserts it into CachedToken.
// Auth: shared secret header X-Broker-Key must match BROKER_KEY env var.
// No user auth — broker runs without a Base44 user context.
//
// Important: we deliberately do NOT use createClientFromRequest here. That helper
// tries to resolve a user from the request and logs spurious 401 "Authentication
// required to view users" errors when the request is anonymous (which broker
// calls always are). createClient is the pure service-role init — no user lookup.

import { createClient } from 'npm:@base44/sdk@0.8.25';

const base44 = createClient({
  appId: Deno.env.get('BASE44_APP_ID'),
  requiresAuth: false,
});

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

    // 3) Upsert by key — service-role only, no user context needed
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