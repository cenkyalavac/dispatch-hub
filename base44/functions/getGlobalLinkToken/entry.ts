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

    // Broker pushes TWO tokens — globallink_jwt (Authorization: Bearer) AND
    // globallink_csrf (PD requires it as the `csrfToken` header on .pd endpoints).
    // We read both in parallel so a single helper call returns everything callers need.
    const [jwtRows, csrfRows] = await Promise.all([
      base44.asServiceRole.entities.CachedToken.filter({ key: 'globallink_jwt' }),
      base44.asServiceRole.entities.CachedToken.filter({ key: 'globallink_csrf' }),
    ]);

    if (!jwtRows || jwtRows.length === 0) {
      return Response.json(
        { error: 'GlobalLink token not yet cached. Is broker service running?' },
        { status: 503 }
      );
    }

    const cached = jwtRows[0];
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

    // CSRF is optional from this helper's POV — if missing, callers fall back
    // to JWT-only and PD will tell us via 401 with a useful body.
    const csrf = csrfRows?.[0] || null;

    return Response.json({
      token_value: cached.token_value,
      expires_at: cached.expires_at,
      scope: cached.scope || '',
      last_pushed_at: cached.last_pushed_at || null,
      csrf_value: csrf?.token_value || null,
      csrf_expires_at: csrf?.expires_at || null,
    });
  } catch (error) {
    console.error('[getGlobalLinkToken] error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});