import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Reference: GlobalLink PD vendor API recipe (2026-05-14).
// JWT lives ~15 minutes and is refreshed by an external broker that pushes
// into the CachedToken entity (key='globallink_jwt'). We therefore read the
// JWT via the getGlobalLinkToken helper — NOT from env — so the token always
// reflects the broker's latest push.
const DEFAULT_BASE = 'https://gle-prod-eu.transperfect.com/PD';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    await base44.auth.me().catch(() => null);

    // Pull JWT from CachedToken via helper (broker keeps it fresh).
    const tokenRes = await base44.asServiceRole.functions.invoke('getGlobalLinkToken', {});
    if (!tokenRes?.data?.token_value) {
      return Response.json({
        success: false,
        configured: false,
        error: tokenRes?.data?.error
          || 'No cached GlobalLink JWT. Is the token broker running and pushing? Check /health on the broker service.',
        hint: "Broker pushes to CachedToken[key=globallink_jwt] every ~60s. If empty, broker hasn't bootstrapped yet.",
      }, { status: 503 });
    }
    const jwt = tokenRes.data.token_value;
    const contextUser = Deno.env.get('GLOBALLINK_CONTEXT_USER') || 'VerbatoTrans';
    const base = (Deno.env.get('GLOBALLINK_BASE_URL') || DEFAULT_BASE).replace(/\/$/, '');

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
        error: `GlobalLink API HTTP ${res.status}. ${res.status === 401 ? 'Broker token may be stale — check broker /health.' : ''}`,
        response: body,
        jwt: jwtInfo,
      });
    }

    return Response.json({
      success: true,
      api_base: base,
      api_status: res.status,
      whoami: { Login: contextUser },
      // submissionTargetSearch.pd exposes the grand total under gridContentInfo.totalCount.
      // Fall back to items.length when the field is missing (older PD builds).
      available_count: body?.gridContentInfo?.totalCount ?? (Array.isArray(body?.items) ? body.items.length : null),
      jwt: jwtInfo,
      token_source: 'cached_token_entity',
      token_last_pushed_at: tokenRes.data.last_pushed_at || null,
    });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});