import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const clientId = Deno.env.get('SYMFONIE_CLIENT_ID');
    const clientSecret = Deno.env.get('SYMFONIE_CLIENT_SECRET');
    const serviceAccount = Deno.env.get('SYMFONIE_SERVICE_ACCOUNT');

    if (!clientId || !clientSecret) {
      return Response.json({ error: 'SYMFONIE_CLIENT_ID veya SYMFONIE_CLIENT_SECRET eksik' }, { status: 400 });
    }

    // Moravia Login (service account flow)
    const params = new URLSearchParams();
    params.append('grant_type', 'service');
    params.append('client_id', clientId);
    params.append('client_secret', clientSecret);
    params.append('scope', 'symfonie2-api');
    if (serviceAccount) params.append('service_account', serviceAccount);

    const tokenRes = await fetch('https://login.moravia.com/connect/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      return Response.json({ error: 'Token alınamadı', details: err, method: 'moravia_login' }, { status: 400 });
    }

    const tokenData = await tokenRes.json();
    return Response.json({
      access_token: tokenData.access_token,
      expires_in: tokenData.expires_in,
      method: 'moravia_login'
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});