import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

async function appendToSheets(base44, taskRecord) {
  const spreadsheetId = Deno.env.get('GOOGLE_SHEETS_SPREADSHEET_ID');
  if (!spreadsheetId) { console.warn('GOOGLE_SHEETS_SPREADSHEET_ID not set'); return false; }

  const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlesheets');

  const row = [
    taskRecord.task_id,
    taskRecord.task_name,
    taskRecord.project_name || '',
    taskRecord.client_name || '',
    taskRecord.source_language || '',
    taskRecord.target_language || '',
    taskRecord.word_count || '',
    taskRecord.price || '',
    taskRecord.due_date || '',
    taskRecord.accepted_at || '',
    taskRecord.matched_rule || 'Manual'
  ];

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A1:append?valueInputOption=USER_ENTERED`,
    {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [row] })
    }
  );

  if (!res.ok) {
    console.error('Sheets append failed:', res.status, await res.text());
    return false;
  }
  return true;
}

const TENANT_ID = Deno.env.get('SYMFONIE_TENANT_ID') || 'ead220ab-1743-4c57-83ae-e055f3401f19';
const SCOPE = 'api://c2e8870d-faef-45ea-919c-b603f97bd0cc/.default';
const BASE_URL = 'https://projects.moravia.com/Api/V5';

async function getToken() {
  const clientId = Deno.env.get('SYMFONIE_CLIENT_ID');
  const clientSecret = Deno.env.get('SYMFONIE_CLIENT_SECRET');
  if (!clientId || !clientSecret) throw new Error('SYMFONIE_CLIENT_ID or SYMFONIE_CLIENT_SECRET is missing');

  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');
  params.append('client_id', clientId);
  params.append('client_secret', clientSecret);
  params.append('scope', SCOPE);

  const tokenRes = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });

  if (!tokenRes.ok) throw new Error('Failed to get token: ' + await tokenRes.text());
  const d = await tokenRes.json();
  return d.access_token;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { task_id, task_name, project_name, source_language, target_language, word_count, price, due_date } = body;

    if (!task_id) return Response.json({ error: 'task_id is required' }, { status: 400 });
    const taskIdNum = Number(task_id);

    const token = await getToken();

    // Execute Accept command on Symfonie
    const res = await fetch(`${BASE_URL}/Tasks(${taskIdNum})/Default.ExecuteTaskCommand`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ taskCommand: 'Accept' })
    });

    const responseText = await res.text();
    if (!res.ok) {
      console.error(`Manual Accept for task ${taskIdNum} failed [${res.status}]:`, responseText.substring(0, 300));
      return Response.json({ error: `Accept failed: ${responseText.substring(0, 200)}` }, { status: 400 });
    }

    // Save to AcceptedTask
    const taskRecord = {
      portal: 'symfonie',
      task_id: taskIdNum,
      task_name: task_name || '',
      project_name: project_name || '',
      source_language: source_language || '',
      target_language: target_language || '',
      word_count: word_count || 0,
      price: price || 0,
      due_date: due_date || null,
      accepted_at: new Date().toISOString(),
      matched_rule: 'Manual',
      status: 'accepted',
      sheets_synced: false,
    };

    const saved = await base44.asServiceRole.entities.AcceptedTask.create(taskRecord);
    console.log(`Task ${taskIdNum} manually accepted by ${user?.email || 'user'}`);

    const synced = await appendToSheets(base44, taskRecord);
    if (synced) {
      await base44.asServiceRole.entities.AcceptedTask.update(saved.id, { sheets_synced: true });
    }

    return Response.json({ success: true, sheets_synced: synced });
  } catch (error) {
    console.error('symfonieAcceptTask error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});