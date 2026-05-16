import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Sheet write is delegated to `sheetsSyncPending` (fire-and-forget). That's the
// single code path that honours SheetColumnMapping + SheetRoute — duplicating it
// inline here was silently ignoring per-portal column config and breaking when
// the destination tab wasn't named "Sheet1" / "Sayfa1".

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
    // Permissive gate: allow admin users (manual UI clicks) AND service
    // callers (acceptViaToken's token-flow has no end-user context).
    // Reject anonymous app users only — the token validation in
    // acceptViaToken is the security boundary for the public path.
    const isService = !user
      || user.is_service === true
      || (typeof user.email === 'string' && user.email.startsWith('service+'));
    if (!isService && user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const { task_id, task_name, project_name, account_name, source_language, target_language, word_count, price, due_date } = body;

    if (!task_id) return Response.json({ error: 'task_id is required' }, { status: 400 });
    const taskIdNum = Number(task_id);

    // Kill switch: respect the connector's active flag. Manual accept must not
    // bypass a paused portal — matches the behaviour of symfonieProcessTasks.
    const portalRows = await base44.asServiceRole.entities.Portal.filter({ key: 'symfonie' });
    if (portalRows[0]?.is_active === false) {
      return Response.json({ error: 'Symfonie connector is paused' }, { status: 409 });
    }
    // Client attribution: every AcceptedTask + Project carries the Client.id
    // mapped to this portal so the BMS can filter projects by end-customer.
    const portalClientId = portalRows[0]?.client_id || null;

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

    // Belazy parity enrichment — pull the live Task (incl. JobId, OrderDate),
    // then chain Project → Job → User → WordCountAnalyses. All failures are
    // non-fatal: we never roll back a successful Accept just because metadata
    // couldn't be resolved.
    async function getJson(url) {
      const r = await fetch(url, { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' } });
      if (!r.ok) return null;
      return r.json().catch(() => null);
    }

    let symfonieTask = null;
    try { symfonieTask = await getJson(`${BASE_URL}/Tasks(${taskIdNum})`); } catch (e) { console.error('Task fetch failed:', e.message); }

    const projectIdNum = symfonieTask?.Project?.Id || null;
    const jobIdNum = symfonieTask?.JobId || null;

    let projectInfo = null;
    let jobInfo = null;
    let pm = null;
    if (projectIdNum) {
      try { projectInfo = await getJson(`${BASE_URL}/Projects(${projectIdNum})`); } catch (e) { console.error('Project fetch failed:', e.message); }
    }
    if (jobIdNum) {
      try { jobInfo = await getJson(`${BASE_URL}/Jobs(${jobIdNum})?$select=Id,Identifier,ExternalId`); } catch (e) { console.error('Job fetch failed:', e.message); }
    }
    if (projectInfo?.ProjectManagerId) {
      try { pm = await getJson(`${BASE_URL}/Users(${projectInfo.ProjectManagerId})?$select=Id,FirstName,LastName`); } catch (e) { console.error('PM fetch failed:', e.message); }
    }

    // Leverage bands — delegate to the shared helper.
    let bands = {};
    try {
      const aRes = await base44.asServiceRole.functions.invoke('symfonieGetTaskAnalysis', { task_id: taskIdNum });
      const a = aRes?.data;
      if (a && a.analysis_found) {
        bands = {
          lev_context: a.lev_context, lev_rep: a.lev_rep, lev_match100: a.lev_match100,
          lev_9599: a.lev_9599, lev_8594: a.lev_8594, lev_7584: a.lev_7584,
          lev_5074: a.lev_5074, lev_no_match: a.lev_no_match,
          parser_type: a.parser_type || '',
        };
      }
    } catch (e) {
      console.error('WordCountAnalyses fetch failed:', e.message);
    }

    // Save to AcceptedTask
    const taskRecord = {
      portal: 'symfonie',
      client_id: portalClientId,
      task_id: taskIdNum,
      task_name: task_name || symfonieTask?.Name || '',
      project_name: project_name || symfonieTask?.Project?.Name || '',
      client_name: account_name || projectInfo?.Customer?.Name || '',
      source_language: source_language || symfonieTask?.SourceLanguageCode || '',
      target_language: target_language || symfonieTask?.TargetLanguageCode || '',
      word_count: word_count || 0,
      price: price || 0,
      due_date: due_date || symfonieTask?.DueDate || null,
      accepted_at: new Date().toISOString(),
      matched_rule: 'Manual',
      status: 'accepted',
      sheets_synced: false,
      workflow_name: symfonieTask?.WorkflowName || '',
      project_manager_first_name: pm?.FirstName || '',
      project_manager_last_name: pm?.LastName || '',
      symfonie_code: projectInfo?.Code || '',
      symfonie_link: jobIdNum ? `https://projects.moravia.com/Jobs/Detail/${jobIdNum}#task-${taskIdNum}` : '',
      order_date: symfonieTask?.OrderDate || null,
      job_id: jobIdNum,
      job_identifier: jobInfo?.Identifier || '',
      project_id: projectIdNum,
      ...bands,
    };

    // Persist guard: upstream Symfonie has already accepted the task at this
    // point. If AcceptedTask.create throws, the task is accepted on Symfonie
    // but invisible to us — a CRITICAL data-loss scenario. Record a SystemIssue
    // (which emails admins) and re-raise so the caller sees the 500. The
    // upstream task_id is in the issue's external_ref for manual recovery.
    let saved;
    try {
      saved = await base44.asServiceRole.entities.AcceptedTask.create(taskRecord);
    } catch (persistErr) {
      base44.functions.invoke('recordSystemIssue', {
        type: 'accept_persist_failure',
        severity: 'critical',
        portal: 'symfonie',
        function_name: 'symfonieAcceptTask',
        external_ref: String(taskIdNum),
        dedup_key: `accept:${taskIdNum}`,
        title: `Symfonie task ${taskIdNum} accepted upstream but persist failed`,
        description: `Task "${task_name || taskRecord.task_name}" was Accepted on Symfonie successfully, but AcceptedTask.create threw: ${persistErr.message}\n\nThis task is now accepted on the portal but invisible to the Hub. Recover by manually creating an AcceptedTask row with task_id=${taskIdNum}, or by re-running the accept (idempotent on Symfonie side).`,
      }).catch((e) => console.error('recordSystemIssue failed:', e.message));
      throw persistErr;
    }
    console.log(`Task ${taskIdNum} manually accepted by ${user?.email || 'user'}`);

    // Sheet write is delegated to sheetsSyncPending (fire-and-forget). It owns
    // SheetColumnMapping + SheetRoute resolution — the single source of truth.
    base44.functions.invoke('sheetsSyncPending', {})
      .catch((e) => console.error('sheetsSyncPending trigger failed:', e.message));

    // BMS Integration: project = downstream-facing record of this accepted task.
    // Failures here MUST NOT roll back the Symfonie accept — log and continue.
    let project = null;
    try {
      project = await base44.asServiceRole.entities.Project.create({
        tenant_id: 'default',
        client_id: portalClientId,
        accepted_task_id: saved.id,
        portal: 'symfonie',
        external_id: `symfonie:${taskIdNum}`,
        state: 'accepted',
        name: task_name || '',
        client_name: account_name || '',
        project_name: project_name || '',
        source_language: source_language || '',
        target_language: target_language || '',
        word_count: word_count || 0,
        price: price || 0,
        currency: 'USD',
        due_date: due_date || null,
        accepted_at: taskRecord.accepted_at,
        origin: body,
      });
      base44.functions.invoke('dispatchWebhook', {
        tenant_id: 'default', event: 'project.accepted', project_id: project.id,
      }).catch((e) => console.error('webhook dispatch failed:', e.message));
    } catch (e) {
      console.error('Project create failed:', e.message);
    }

    // Handoff: Symfonie attachment'larini Dropbox'a indir (fire-and-log; basarisiz olursa accept iptal olmaz)
    let handoff = null;
    try {
      const hoRes = await base44.functions.invoke('symfonieDownloadAttachments', {
        task_id: taskIdNum,
        task_name: task_name || '',
        project_name: project_name || '',
        account_name: account_name || 'Symfonie',
        project_id: project?.id || null,
        job_id: jobIdNum,
      });
      handoff = hoRes.data;
    } catch (e) {
      console.error('Handoff failed:', e.message);
      handoff = { error: e.message };
    }

    return Response.json({ success: true, sheets_sync: 'queued', handoff, project_id: project?.id || null });
  } catch (error) {
    console.error('symfonieAcceptTask error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});