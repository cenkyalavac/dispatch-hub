import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const TENANT_ID = 'ead220ab-1743-4c57-83ae-e055f3401f19';
const SCOPE = 'api://c2e8870d-faef-45ea-919c-b603f97bd0cc/.default';
const BASE_URL = 'https://projects.moravia.com/Api/V5';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const clientId = Deno.env.get('SYMFONIE_CLIENT_ID');
    const clientSecret = Deno.env.get('SYMFONIE_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      return Response.json({ error: 'SYMFONIE_CLIENT_ID or SYMFONIE_CLIENT_SECRET is missing from secrets' }, { status: 400 });
    }

    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', clientId);
    params.append('client_secret', clientSecret);
    params.append('scope', SCOPE);

    console.log('Requesting Azure AD token, clientId prefix:', clientId.substring(0, 8) + '...');

    const tokenRes = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });

    const responseText = await tokenRes.text();
    console.log('Azure AD response status:', tokenRes.status);

    if (!tokenRes.ok) {
      console.error('Azure AD error:', responseText);
      let details;
      try { details = JSON.parse(responseText); } catch (_) { details = responseText; }
      return Response.json({ error: 'Failed to get token', details, status: tokenRes.status }, { status: 400 });
    }

    const tokenData = JSON.parse(responseText);

    // Test WhoAmI endpoint
    const whoRes = await fetch(`${BASE_URL}/Users/Default.WhoAmI`, {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Accept': 'application/json'
      }
    });

    const whoText = await whoRes.text();
    console.log('WhoAmI status:', whoRes.status, whoText.substring(0, 200));

    // Test: fetch one task to verify Tasks API access (no $expand — Project is not a navigation property)
    const tasksTestRes = await fetch(
      `${BASE_URL}/Tasks?$filter=State eq 'Order'&$expand=FinanceRows&$top=1`,
      {
        headers: {
          'Authorization': `Bearer ${tokenData.access_token}`,
          'Accept': 'application/json'
        }
      }
    );
    const tasksTestText = await tasksTestRes.text();
    let tasksTestData;
    try { tasksTestData = JSON.parse(tasksTestText); } catch (_) { tasksTestData = tasksTestText; }

    return Response.json({
      success: true,
      token_expires_in: tokenData.expires_in,
      token_type: tokenData.token_type,
      whoami_status: whoRes.status,
      whoami: whoRes.ok ? JSON.parse(whoText) : whoText,
      tasks_api_status: tasksTestRes.status,
      tasks_sample: tasksTestData,
    });
  } catch (error) {
    console.error('Exception:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});