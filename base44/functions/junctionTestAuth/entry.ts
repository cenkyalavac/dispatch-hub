import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const PROD_BASE = 'https://hypnos.welocalize.tools';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const jwt = Deno.env.get('JUNCTION_JWT');
    const apiBase = Deno.env.get('JUNCTION_API_BASE') || PROD_BASE;

    if (!jwt) {
      return Response.json({
        success: false,
        error: 'JUNCTION_JWT secret is not set. Get the token from junction.welocalize.com (Chrome DevTools → Network → any request → "pantheon-auth" header) and save it as the JUNCTION_JWT secret.',
        configured: false,
      });
    }

    // Test by calling the offers endpoint with a tiny page
    const url = `${apiBase}/v2/offer/me?limit=1&offset=0`;
    const r = await fetch(url, {
      method: 'GET',
      headers: { 'x-pantheon-auth': jwt, 'Accept': 'application/json' },
    });

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