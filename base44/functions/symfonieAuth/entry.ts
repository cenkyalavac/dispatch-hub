import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const TENANT_ID = 'ead220ab-1743-4c57-83ae-e055f3401f19';
const SCOPE = 'api://c2e8870d-faef-45ea-919c-b603f97bd0cc/.default';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
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
    params.append('scope', SCOPE);

    console.log('Azure AD token isteği gönderiliyor, clientId:', clientId.substring(0, 8) + '...');

    const tokenRes = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });

    const responseText = await tokenRes.text();
    console.log('Azure AD yanıt status:', tokenRes.status);

    if (!tokenRes.ok) {
      console.error('Azure AD hata:', responseText);
      return Response.json({ error: 'Token alınamadı', details: JSON.parse(responseText), status: tokenRes.status }, { status: 400 });
    }

    const tokenData = JSON.parse(responseText);

    // Test: WhoAmI endpoint'ini çağır
    const whoRes = await fetch('https://projects.moravia.com/Api/V5/Users/Default.WhoAmI', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Accept': 'application/json'
      }
    });

    const whoText = await whoRes.text();
    console.log('WhoAmI status:', whoRes.status, whoText.substring(0, 200));

    return Response.json({
      success: tokenRes.ok,
      expires_in: tokenData.expires_in,
      token_type: tokenData.token_type,
      whoami_status: whoRes.status,
      whoami: whoRes.ok ? JSON.parse(whoText) : whoText
    });
  } catch (error) {
    console.error('Exception:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});