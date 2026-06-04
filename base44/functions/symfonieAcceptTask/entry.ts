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

    // Leverage bands + native WWC + fallback formula. The helper resolves
    // symfonie_calculated_qty alongside bands; we only fall back to the
    // generic 0.2/0.35/0.45/0.6 formula when Symfonie didn't emit one.
    const computeWeightedWcFallback = (b) =>
      (Number(b.lev_9599) || 0) * 0.2 +
      (Number(b.lev_8594) || 0) * 0.35 +
      (Number(b.lev_7584) || 0) * 0.45 +
      ((Number(b.lev_5074) || 0) + (Number(b.lev_no_match) || 0)) * 0.6;

    let bands = {};
    try {
      // Use regular functions.invoke — asServiceRole.functions.invoke is
      // rejected by the platform's invoke layer with a blanket 403 before
      // reaching the target function. Regular invoke threads through the
      // calling user's context (admin UI = admin user; token flow = null
      // user); both pass symfonieGetTaskAnalysis's permissive auth gate
      // (admin OR service caller). Previously this silently failed inside
      // the try/catch and CAT bands were always 0/empty for manual accepts —
      // BMS therefore received cat_analysis=null. See diff 2026-06-04.
      const aRes = await base44.functions.invoke('symfonieGetTaskAnalysis', { task_id: taskIdNum });
      const a = aRes?.data;
      if (a && a.analysis_found) {
        const wwc = (typeof a.symfonie_calculated_qty === 'number' && a.symfonie_calculated_qty > 0)
          ? a.symfonie_calculated_qty
          : computeWeightedWcFallback(a);
        bands = {
          lev_context: a.lev_context, lev_rep: a.lev_rep, lev_match100: a.lev_match100,
          lev_9599: a.lev_9599, lev_8594: a.lev_8594, lev_7584: a.lev_7584,
          lev_5074: a.lev_5074, lev_no_match: a.lev_no_match,
          parser_type: a.parser_type || '',
          weighted_wc: wwc,
          symfonie_calculated_qty: a.symfonie_calculated_qty || null,
        };
      }
    } catch (e) {
      console.error('WordCountAnalyses fetch failed:', e.message);
    }

    // Vendor financial breakdown (PurchaseOrder.Prices) — fetched inline for
    // manual accepts. Non-fatal: null when no PO is attached yet.
    async function fetchVendorPayment() {
      try {
        const r = await fetch(`${BASE_URL}/Tasks(${taskIdNum})?$expand=PurchaseOrders($expand=Prices)`, {
          headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
        });
        if (!r.ok) return null;
        const body = await r.json().catch(() => null);
        const pos = body?.PurchaseOrders || [];
        if (pos.length === 0) return null;
        const po = pos.sort((a, b) => (b.Id || 0) - (a.Id || 0))[0];
        const price = po?.Prices?.[0];
        if (!price) return null;
        return {
          partner_id: price.PartnerId ?? po.PartnerId ?? null,
          partner_code: price.PartnerCode || po.PartnerCode || '',
          partner_name: price.PartnerName || po.PartnerName || '',
          currency: price.PartnerCurrency || '',
          unit_cost: Number(price.UnitCost) || 0,
          partner_price: Number(price.PartnerPrice) || 0,
          usd_unit_cost: Number(price.UsdUnitCost) || 0,
          usd_price: Number(price.UsdPrice) || 0,
        };
      } catch { return null; }
    }
    const vendorPayment = await fetchVendorPayment();

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
      // BMS-facing financial + brief — Project.Notes comes from the project
      // enrichment lookup; vendor_payment from PurchaseOrder.Prices above.
      vendor_payment: vendorPayment || null,
      project_notes: projectInfo?.Notes || '',
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
        // Pull from taskRecord, NOT the raw request body. taskRecord was
        // already enriched with Symfonie API fallbacks above
        // (`task_name || symfonieTask?.Name`, customer name from /Projects,
        // due_date from /Tasks, etc.). Reading the body directly was fine
        // for direct UI accepts (the frontend sends complete payloads), but
        // acceptViaToken's task_payload snapshot can be sparse — when a
        // notification email was sent before all fields were captured —
        // and that pushed empty strings into Project / BMS. Now both
        // surfaces (AcceptedTask and Project) read from the same enriched
        // record, so they always agree.
        name: taskRecord.task_name,
        client_name: taskRecord.client_name,
        project_name: taskRecord.project_name,
        source_language: taskRecord.source_language,
        target_language: taskRecord.target_language,
        word_count: taskRecord.word_count,
        price: taskRecord.price,
        currency: 'USD',
        due_date: taskRecord.due_date,
        accepted_at: taskRecord.accepted_at,
        // Surface vendor breakdown + project notes at Project level so BMS
        // API can read them without joining back to AcceptedTask.
        vendor_payment: vendorPayment || null,
        project_notes: projectInfo?.Notes || '',
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