import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const PROD_BASE = 'https://hypnos.welocalize.tools';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Soft auth: if the session is missing/expired we still allow the test —
    // this endpoint only proves Junction credentials work, no Base44 data is touched.
    const user = await base44.auth.me().catch(() => null);
    if (!user) {
      console.warn('junctionTestAuth: no Base44 user, continuing anonymously');
    }

    const jwt = Deno.env.get('JUNCTION_JWT');
    const apiKey = Deno.env.get('JUNCTION_API_KEY');
    const apiBase = PROD_BASE;

    if (!jwt) {
      return Response.json({
        success: false,
        error: 'JUNCTION_JWT secret is not set. Get the token from junction.welocalize.com (Chrome DevTools → Console → window.jwt) and save it as the JUNCTION_JWT secret.',
        configured: false,
      });
    }

    // Test by calling the offers endpoint. The /v2/offer/me endpoint returns the full list
    // and rejects limit/offset query params with HTTP 400.
    // x-api-key is defensive — Welocalize sends it from the UI; not yet enforced but include it when present.
    const url = `${apiBase}/v2/offer/me`;
    const headers = { 'x-pantheon-auth': jwt, 'Accept': 'application/json' };
    if (apiKey) headers['x-api-key'] = apiKey;
    const r = await fetch(url, { method: 'GET', headers });

    const text = await r.text();
    let body;
    try { body = JSON.parse(text); } catch { body = text.slice(0, 500); }

    // Try to decode JWT for expiry
    let jwtInfo = null;
    try {
      const payload = JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      jwtInfo = {
        exp: payload.exp,
        expires_at: payload.exp ? new Date(payload.exp * 1000).toISOString() : null,
        expires_in_days: payload.exp ? Math.floor((payload.exp * 1000 - Date.now()) / 86400000) : null,
        sub: payload.sub || payload.userId || null,
      };
    } catch {}

    if (r.ok) {
      return Response.json({
        success: true,
        api_base: apiBase,
        offers_api_status: r.status,
        offers_count: Array.isArray(body) ? body.length : (body?.data?.length ?? null),
        jwt: jwtInfo,
        sample: Array.isArray(body) ? body.slice(0, 1) : body,
      });
    }

    return Response.json({
      success: false,
      api_base: apiBase,
      offers_api_status: r.status,
      error: `Junction API returned HTTP ${r.status}. ${r.status === 401 ? 'Token may be expired — refresh JUNCTION_JWT.' : ''}`,
      response: body,
      jwt: jwtInfo,
    });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});