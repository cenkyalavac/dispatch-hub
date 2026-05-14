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
    const csrf = tokenRes.data.csrf_value || null;
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
    // PD requires BOTH Authorization: Bearer JWT AND a `csrfToken` header on .pd endpoints.
    // The broker pushes the CSRF alongside the JWT into CachedToken[key=globallink_csrf].
    const probeHeaders = {
      'Authorization': `Bearer ${jwt}`,
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      'ajaxRequest': 'true',
      'appVersion': '11.5.0',
      'contextUser': contextUser,
    };
    if (csrf) probeHeaders['csrfToken'] = csrf;
    const res = await fetch(`${base}/submissionTargetSearch.pd`, {
      method: 'POST',
      headers: probeHeaders,
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

    // Diagnostic logging — PD 401s often come back with an EMPTY body and
    // the real reason lives in headers (WWW-Authenticate) or response status text.
    // Capture everything so we can see the actual rejection cause from runtime logs.
    if (!res.ok) {
      // Body FIRST — PD's rejection reason. CSP header dump is huge (~2KB) and
      // truncates downstream logs, so we surface the body on its own line and
      // skip headers entirely (only WWW-Authenticate matters and we extract it).
      const wwwAuth = res.headers.get('www-authenticate') || null;
      console.log('[globallinkTestAuth] PD body', text.slice(0, 1000));
      console.log('[globallinkTestAuth] PD meta', {
        status: res.status,
        statusText: res.statusText,
        body_length: text.length,
        www_authenticate: wwwAuth,
        context_user: contextUser,
        api_base: base,
        jwt_sub: jwtInfo?.sub,
        jwt_expires_in_minutes: jwtInfo?.expires_in_minutes,
        csrf_present: !!csrf,
      });
    }

    if (!res.ok) {
      // Surface the actual PD error message — 401s typically include a
      // body like {"errorCode":"...","errorMessage":"..."} that explains
      // whether it's a stale token vs a contextUser mismatch vs scope issue.
      const detail =
        (body && typeof body === 'object' && (body.errorMessage || body.message || body.error)) ||
        (typeof body === 'string' && body.length > 0 ? body : null);
      const reason = res.status === 401
        ? (detail
            ? `PD says: ${detail}`
            : 'PD rejected the JWT. Likely causes: (a) broker pushed a stale token, (b) contextUser mismatch — JWT sub is not authorized for this vendor org.')
        : (detail || 'PD rejected the request.');
      return Response.json({
        success: false,
        api_base: base,
        api_status: res.status,
        error: `GlobalLink API HTTP ${res.status}. ${reason}`,
        response: body,
        jwt: jwtInfo,
        debug: {
          context_user_used: contextUser,
          token_last_pushed_at: tokenRes.data.last_pushed_at || null,
          token_expires_at: tokenRes.data.expires_at || null,
          csrf_present: !!csrf,
          csrf_expires_at: tokenRes.data.csrf_expires_at || null,
        },
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