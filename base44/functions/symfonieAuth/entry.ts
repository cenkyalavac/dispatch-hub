import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const clientId = Deno.env.get('SYMFONIE_CLIENT_ID');
    const clientSecret = Deno.env.get('SYMFONIE_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      return Response.json({ error: 'SYMFONIE_CLIENT_ID veya SYMFONIE_CLIENT_SECRET eksik' }, { status: 400 });
    }

    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', clientId);
    params.append('client_secret', clientSecret);

    const tokenRes = await fetch('https://projects.moravia.com/connect/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      return Response.json({ error: 'Token alınamadı', details: err }, { status: 400 });
    }

    const tokenData = await tokenRes.json();
    return Response.json({ access_token: tokenData.access_token, expires_in: tokenData.expires_in });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});