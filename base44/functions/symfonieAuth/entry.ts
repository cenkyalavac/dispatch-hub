import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const clientId = Deno.env.get('SYMFONIE_CLIENT_ID');
    const clientSecret = Deno.env.get('SYMFONIE_CLIENT_SECRET');
    const tenantId = Deno.env.get('SYMFONIE_TENANT_ID'); // Azure AD tenant ID (optional)

    if (!clientId || !clientSecret) {
      return Response.json({ error: 'SYMFONIE_CLIENT_ID veya SYMFONIE_CLIENT_SECRET eksik' }, { status: 400 });
    }

    let tokenRes;

    if (tenantId) {
      // Azure AD token (preferred method)
      const params = new URLSearchParams();
      params.append('grant_type', 'client_credentials');
      params.append('client_id', clientId);
      params.append('client_secret', clientSecret);
      params.append('scope', 'api://c2e8870d-faef-45ea-919c-b603f97bd0cc/.default');

      tokenRes = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString()
      });
    } else {
      // Moravia Login token (legacy)
      const serviceAccount = Deno.env.get('SYMFONIE_SERVICE_ACCOUNT');
      const params = new URLSearchParams();
      params.append('grant_type', 'service');
      params.append('client_id', clientId);
      params.append('client_secret', clientSecret);
      params.append('scope', 'symfonie2-api');
      if (serviceAccount) params.append('service_account', serviceAccount);

      tokenRes = await fetch('https://login.moravia.com/connect/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString()
      });
    }

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      return Response.json({ error: 'Token alınamadı', details: err, method: tenantId ? 'azure_ad' : 'moravia_login' }, { status: 400 });
    }

    const tokenData = await tokenRes.json();
    return Response.json({ 
      access_token: tokenData.access_token, 
      expires_in: tokenData.expires_in,
      method: tenantId ? 'azure_ad' : 'moravia_login'
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});