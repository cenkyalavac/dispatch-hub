// Reject a Symfonie task. Mirror of symfonieAcceptTask but executes 'Reject' command.
// Does NOT create a Project record (rejected tasks don't enter the BMS pipeline) and does NOT touch Dropbox.
// Writes an AcceptedTask row with status='rejected' for auditing.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const TENANT_ID = Deno.env.get('SYMFONIE_TENANT_ID') || 'ead220ab-1743-4c57-83ae-e055f3401f19';
const SCOPE = 'api://c2e8870d-faef-45ea-919c-b603f97bd0cc/.default';
const BASE_URL = 'https://projects.moravia.com/Api/V5';

async function getToken() {
  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');
  params.append('client_id', Deno.env.get('SYMFONIE_CLIENT_ID'));
  params.append('client_secret', Deno.env.get('SYMFONIE_CLIENT_SECRET'));
  params.append('scope', SCOPE);
  const tokenRes = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  if (!tokenRes.ok) throw new Error('Failed to get token: ' + await tokenRes.text());
  return (await tokenRes.json()).access_token;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { task_id, task_name, project_name, account_name, source_language, target_language, word_count, price, due_date } = body;
    if (!task_id) return Response.json({ error: 'task_id is required' }, { status: 400 });

    // Kill switch: paused connector must not accept/reject either.
    const portalRows = await base44.asServiceRole.entities.Portal.filter({ key: 'symfonie' });
    if (portalRows[0]?.is_active === false) {
      return Response.json({ error: 'Symfonie connector is paused' }, { status: 409 });
    }

    const taskIdNum = Number(task_id);
    const token = await getToken();

    const res = await fetch(`${BASE_URL}/Tasks(${taskIdNum})/Default.ExecuteTaskCommand`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ taskCommand: 'Reject' }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`Reject task ${taskIdNum} failed [${res.status}]:`, text.slice(0, 300));
      return Response.json({ error: `Reject failed: ${text.slice(0, 200)}` }, { status: 400 });
    }

    await base44.asServiceRole.entities.AcceptedTask.create({
      portal: 'symfonie',
      task_id: taskIdNum,
      task_name: task_name || '',
      project_name: project_name || '',
      client_name: account_name || '',
      source_language: source_language || '',
      target_language: target_language || '',
      word_count: word_count || 0,
      price: price || 0,
      due_date: due_date || null,
      accepted_at: new Date().toISOString(),
      matched_rule: 'Manual',
      status: 'rejected',
      sheets_synced: false,
    });

    console.log(`Task ${taskIdNum} manually rejected by ${user?.email || 'user'}`);
    return Response.json({ success: true });
  } catch (error) {
    console.error('symfonieRejectTask error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});