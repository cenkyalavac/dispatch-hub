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
      return Response.json({ error: 'Eksik secret' }, { status: 400 });
    }

    // Debug: log what we're sending (first chars only for security)
    console.log('clientId:', clientId);
    console.log('clientSecret length:', clientSecret?.length);
    console.log('serviceAccount:', serviceAccount);

    const params = new URLSearchParams();
    params.append('grant_type', 'service');
    params.append('client_id', clientId);
    params.append('client_secret', clientSecret);
    params.append('scope', 'symfonie2-api');
    if (serviceAccount) params.append('service_account', serviceAccount);

    console.log('Sending to Moravia:', params.toString().replace(clientSecret, '***'));

    const tokenRes = await fetch('https://login.moravia.com/connect/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });

    const responseText = await tokenRes.text();
    console.log('Moravia response status:', tokenRes.status);
    console.log('Moravia response:', responseText);

    if (!tokenRes.ok) {
      return Response.json({ error: 'Token alınamadı', details: responseText, status: tokenRes.status }, { status: 400 });
    }

    const tokenData = JSON.parse(responseText);
    return Response.json({
      access_token: tokenData.access_token,
      expires_in: tokenData.expires_in,
      method: 'moravia_login'
    });
  } catch (error) {
    console.error('Exception:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});