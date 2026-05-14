// Internal helper endpoint — reads the most recent cached GlobalLink JWT
// from the CachedToken entity. Used by other Hub backend functions
// (e.g. GlobalLink adapter) via base44.functions.invoke('getGlobalLinkToken').
//
// Throws if no token has ever been pushed by the broker, or if the cached
// token is past its expires_at (with a 30s safety buffer).

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const rows = await base44.asServiceRole.entities.CachedToken.filter({ key: 'globallink_jwt' });
    if (!rows || rows.length === 0) {
      return Response.json(
        { error: 'GlobalLink token not yet cached. Is broker service running?' },
        { status: 503 }
      );
    }

    const cached = rows[0];
    const expiresAt = new Date(cached.expires_at).getTime();
    const now = Date.now();

    // 30s safety buffer — treat token as expired slightly early
    if (Number.isNaN(expiresAt) || now >= expiresAt - 30_000) {
      return Response.json(
        {
          error: `GlobalLink token expired at ${cached.expires_at}. Broker should have refreshed. Check broker logs.`,
          expires_at: cached.expires_at,
        },
        { status: 503 }
      );
    }

    return Response.json({
      token_value: cached.token_value,
      expires_at: cached.expires_at,
      scope: cached.scope || '',
      last_pushed_at: cached.last_pushed_at || null,
    });
  } catch (error) {
    console.error('[getGlobalLinkToken] error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});