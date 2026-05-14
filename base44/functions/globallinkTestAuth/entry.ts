import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Reference: GlobalLink PD vendor API recipe (2026-05-14).
// The .pd endpoints require Bearer JWT + 3 "secret" headers (ajaxRequest, appVersion, contextUser)
// and JSON body. JWT is browser-harvested from localStorage and lives ~15 minutes.
const DEFAULT_BASE = 'https://gle-prod-eu.transperfect.com/PD';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    await base44.auth.me().catch(() => null);

    const jwt = Deno.env.get('GLOBALLINK_JWT');
    const contextUser = Deno.env.get('GLOBALLINK_CONTEXT_USER');
    const base = (Deno.env.get('GLOBALLINK_BASE_URL') || DEFAULT_BASE).replace(/\/$/, '');

    if (!jwt || !contextUser) {
      const missing = [
        !jwt && 'GLOBALLINK_JWT',
        !contextUser && 'GLOBALLINK_CONTEXT_USER',
      ].filter(Boolean);
      return Response.json({
        success: false,
        configured: false,
        error: `Missing secret(s): ${missing.join(', ')}. JWT is harvested from the PD UI's localStorage (~15 min lifetime); contextUser is the vendor org name (e.g. 'VerbatoTrans').`,
      });
    }

    // Decode JWT to surface expiry — useful because the token expires fast.
    let jwtInfo = null;
    try {
      const payload = JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      const expiresInMs = payload.exp ? (payload.exp * 1000 - Date.now()) : null;
      jwtInfo = {
        exp: payload.exp,
        expires_at: payload.exp ? new Date(payload.exp * 1000).toISOString() : null,
        expires_in_minutes: expiresInMs !== null ? Math.floor(expiresInMs / 60000) : null,
        expires_in_days: expiresInMs !== null ? Math.floor(expiresInMs / 86400000) : null,
        sub: payload.sub || payload.preferred_username || null,
      };
    } catch {}

    // Lightweight probe: submissionTargetSearch.pd with size=1 — the same call used to list Available.
    const res = await fetch(`${base}/submissionTargetSearch.pd`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwt}`,
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        'ajaxRequest': 'true',
        'appVersion': '11.5.0',
        'contextUser': contextUser,
      },
      body: JSON.stringify({
        folder: 'AVAILABLE_SUBMISSION',
        entityTickets: [],
        parentEntityTickets: [],
        index: 0,
        size: 1,
      }),
    });

    const text = await res.text();
    let body;
    try { body = JSON.parse(text); } catch { body = text.slice(0, 400); }

    if (!res.ok) {
      return Response.json({
        success: false,
        api_base: base,
        api_status: res.status,
        error: `GlobalLink API HTTP ${res.status}. ${res.status === 401 ? 'JWT may be expired (15-min lifetime) — refresh GLOBALLINK_JWT.' : ''}`,
        response: body,
        jwt: jwtInfo,
      });
    }

    return Response.json({
      success: true,
      api_base: base,
      api_status: res.status,
      whoami: { Login: contextUser },
      available_count: body?.totalCount ?? (Array.isArray(body?.items) ? body.items.length : null),
      jwt: jwtInfo,
    });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});