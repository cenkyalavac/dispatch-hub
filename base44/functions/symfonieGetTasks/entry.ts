import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

async function getToken() {
  const clientId = Deno.env.get('SYMFONIE_CLIENT_ID');
  const clientSecret = Deno.env.get('SYMFONIE_CLIENT_SECRET');
  const tenantId = Deno.env.get('SYMFONIE_TENANT_ID');

  let tokenRes;
  if (tenantId) {
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

  if (!tokenRes.ok) throw new Error('Token alınamadı: ' + await tokenRes.text());
  const d = await tokenRes.json();
  return d.access_token;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const access_token = await getToken();

    const tasksRes = await fetch(
      `https://projects.moravia.com/api/V5/Tasks?$filter=State eq 'ToDo'&$expand=FinanceRows,Project&$top=100`,
      {
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'Accept': 'application/json'
        }
      }
    );

    if (!tasksRes.ok) {
      const err = await tasksRes.text();
      return Response.json({ error: 'Task listesi alınamadı', details: err }, { status: 400 });
    }

    const data = await tasksRes.json();
    const tasks = data.value || [];

    return Response.json({ tasks, total: tasks.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});