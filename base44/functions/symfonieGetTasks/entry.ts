import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Get token first
    const clientId = Deno.env.get('SYMFONIE_CLIENT_ID');
    const clientSecret = Deno.env.get('SYMFONIE_CLIENT_SECRET');

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

    const { access_token } = await tokenRes.json();

    // Fetch tasks in ToDo state (State = 0 means ToDo in Symfonie)
    // We also expand Project info
    const tasksRes = await fetch(
      `https://projects.moravia.com/api/V5/Tasks?$filter=State eq 'ToDo'&$expand=FinanceRows&$top=100`,
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