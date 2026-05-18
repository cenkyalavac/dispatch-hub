import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

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

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// 503/502/429 sıkça oluyor — backoff ile retry yap, schedule'ı bozma.
async function fetchWithRetry(url, token, maxRetries = 4) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
    });
    if (res.ok) return await res.json();
    if ([429, 502, 503, 504].includes(res.status) && attempt < maxRetries) {
      const wait = Math.min(1000 * 2 ** attempt, 8000);
      console.warn(`Symfonie API ${res.status} → wait ${wait}ms (attempt ${attempt + 1}/${maxRetries})`);
      await sleep(wait);
      continue;
    }
    const err = await res.text();
    throw new Error(`Symfonie API error ${res.status}: ${err.substring(0, 500)}`);
  }
}

async function fetchAllPages(url, token) {
  const results = [];
  let nextUrl = url;
  while (nextUrl) {
    const data = await fetchWithRetry(nextUrl, token);
    results.push(...(data.value || []));
    nextUrl = data['@odata.nextLink'] || null;
  }
  return results;
}

function evaluateCondition(condition, task) {
  const { field, operator, value } = condition;
  let taskValue;

  switch (field) {
    case 'project_name': taskValue = (task.project_name || '').toLowerCase(); break;
    case 'task_name': taskValue = (task.task_name || '').toLowerCase(); break;
    case 'workflow_name': taskValue = (task.workflow_name || '').toLowerCase(); break;
    case 'source_language': taskValue = (task.source_language || '').toLowerCase(); break;
    case 'target_language': taskValue = (task.target_language || '').toLowerCase(); break;
    case 'client_name': taskValue = (task.client_name || '').toLowerCase(); break;
    case 'project_manager_first_name': taskValue = (task.project_manager_first_name || '').toLowerCase(); break;
    case 'project_manager_last_name': taskValue = (task.project_manager_last_name || '').toLowerCase(); break;
    case 'word_count':
    case 'quantity': taskValue = Number(task.word_count) || 0; break;
    case 'price': taskValue = Number(task.price) || 0; break;
    default: return true;
  }

  const lowerValue = (value || '').toLowerCase();
  const numValue = Number(value);

  switch (operator) {
    case 'contains': return String(taskValue).includes(lowerValue);
    case 'not_contains': return !String(taskValue).includes(lowerValue);
    case 'equals': return String(taskValue) === lowerValue;
    case 'starts_with': return String(taskValue).startsWith(lowerValue);
    case 'greater_than': return taskValue > numValue;
    case 'less_than': return taskValue < numValue;
    case 'greater_equal': return taskValue >= numValue;
    case 'less_equal': return taskValue <= numValue;
    default: return true;
  }
}

function matchesRule(rule, task) {
  if (!rule.conditions || rule.conditions.length === 0) return true;
  return rule.conditions.every(c => evaluateCondition(c, task));
}

async function executeTaskCommand(taskId, command, token) {
  // POST /v5/Tasks({id})/Default.ExecuteTaskCommand
  // Valid commands: HeadsUp, Order, Claim, Accept, Reject, Complete, Cancel, Reopen, Archive, Approve, Unarchive, OnHold, RejectCompany
  const res = await fetch(`${BASE_URL}/Tasks(${taskId})/Default.ExecuteTaskCommand`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({ taskCommand: command })
  });

  const responseText = await res.text();
  if (!res.ok) {
    console.error(`ExecuteTaskCommand(${command}) for task ${taskId} failed [${res.status}]:`, responseText.substring(0, 300));
    return { ok: false, status: res.status, error: responseText };
  }
  return { ok: true };
}

// Sheet write is delegated to `sheetsSyncPending` (single source of truth).
// Inline legacy 11-column append used to silently ignore SheetColumnMapping
// + SheetRoute config; routing it through sheetsSyncPending keeps every code
// path consistent.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Auth: allow admin users and scheduled/system calls (no user context)
    const user = await base44.auth.me().catch(() => null);
    if (user !== null && user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    console.log('symfonieProcessTasks started, user:', user?.email || 'scheduled/system');

    // Load portal config (only used for the kill switch — sheet routing is
    // handled by sheetsSyncPending which reads its own copy).
    const portalRows = await base44.asServiceRole.entities.Portal.filter({ key: 'symfonie' });
    const portal = portalRows[0] || null;
    // Client attribution: every rule-accepted task + project gets the Client.id
    // mapped to this portal so the BMS can filter by end-customer.
    const portalClientId = portal?.client_id || null;

    // Kill switch: if the portal is toggled off, do nothing. The scheduler still ticks,
    // but no tasks are fetched, accepted, or rejected.
    if (portal && portal.is_active === false) {
      console.log('symfonieProcessTasks skipped: portal is_active=false');
      return Response.json({ success: true, skipped: true, reason: 'Portal disabled', summary: { accepted: 0, rejected: 0, skipped: 0, errors: 0 } });
    }

    // 1. Get active rules sorted by priority (ascending = higher priority runs first)
    const rules = await base44.asServiceRole.entities.Rule.filter({ portal: 'symfonie', is_active: true }, 'priority', 200);
    console.log(`Found ${rules.length} active rules`);

    // 2. Get Azure AD token
    const token = await getToken();
    console.log('Azure AD token acquired');

    // 3. Fetch tasks in 'Order' state (awaiting acceptance) with FinanceRows expanded.
    // BeLazy parity filter — exclude locked tasks and anything older than ~1 month.
    // Locked tasks reject Accept commands at the API layer; pulling them just
    // generates noisy `status='error'` AcceptedTask rows. Stale orders (>30d) are
    // virtually always cancelled upstream — Symfonie itself hides them in its UI.
    const oneMonthAgoIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const filter = encodeURIComponent(
      `State eq 'Order' and LockState eq 'Unlocked' and OrderDate ge ${oneMonthAgoIso}`
    );
    const url = `${BASE_URL}/Tasks?$filter=${filter}&$expand=FinanceRows&$orderby=CreatedAt asc&$top=200`;
    const rawTasks = await fetchAllPages(url, token);
    console.log(`Found ${rawTasks.length} tasks in Order state (unlocked, ≤30d)`);

    // Belazy parity enrichment — resolve in 3 batched lookups (Projects, Jobs, Users).
    // Skipped silently on failure so a transient Symfonie 5xx never blocks acceptance.
    const projectIds = [...new Set(rawTasks.map(t => t.Project?.Id).filter(Boolean))];
    const jobIds = [...new Set(rawTasks.map(t => t.JobId).filter(Boolean))];

    const projectById = new Map(); // Project.Id → { Customer.Name, Code, ProjectManagerId, Notes }
    const jobById = new Map();     // Job.Id → { Identifier, ExternalId }
    const userById = new Map();    // User.Id → { FirstName, LastName }
    // Vendor financial breakdown — we are the vendor, Symfonie attaches a
    // PurchaseOrder to most accepted tasks with Partner* + UsdUnitCost +
    // UsdPrice. Resolved lazily per accepted task below ($expand=Prices on
    // the PO) — pre-batching all POs upfront would fetch ones we never use
    // (rejects, no-rule-match skips).

    async function batchFetch(collection, ids, selectFields) {
      if (ids.length === 0) return [];
      const chunks = [];
      for (let i = 0; i < ids.length; i += 20) chunks.push(ids.slice(i, i + 20));
      const batches = await Promise.all(chunks.map(async (chunk) => {
        const filter = chunk.map(id => `Id eq ${id}`).join(' or ');
        const selectClause = selectFields ? `&$select=${selectFields}` : '';
        return fetchAllPages(
          `${BASE_URL}/${collection}?$filter=${encodeURIComponent(filter)}${selectClause}&$top=${chunk.length}`,
          token
        );
      }));
      return batches.flat();
    }

    try {
      const projects = await batchFetch('Projects', projectIds);
      projects.forEach(p => projectById.set(p.Id, p));
    } catch (e) {
      console.error('Project enrichment failed:', e.message);
    }

    try {
      const jobs = await batchFetch('Jobs', jobIds, 'Id,Identifier,ExternalId');
      jobs.forEach(j => jobById.set(j.Id, j));
    } catch (e) {
      console.error('Job enrichment failed:', e.message);
    }

    // PM lookup — only resolve PMs we actually need (de-duped, valid IDs).
    const pmIds = [...new Set([...projectById.values()].map(p => p.ProjectManagerId).filter(Boolean))];
    try {
      const users = await batchFetch('Users', pmIds, 'Id,FirstName,LastName');
      users.forEach(u => userById.set(u.Id, u));
    } catch (e) {
      console.error('User (PM) enrichment failed:', e.message);
    }

    // 4. Get already-processed task IDs to avoid re-processing
    // Use a Set of numeric task IDs from our AcceptedTask records
    const existing = await base44.asServiceRole.entities.AcceptedTask.list('-created_date', 2000);
    const existingIds = new Set(existing.map(t => Number(t.task_id)));
    console.log(`Already processed: ${existingIds.size} tasks`);

    const results = { accepted: [], rejected: [], skipped: [], errors: [] };

    // Pre-resolve leverage bands in ONE batch instead of N sequential invokes.
    // Two callers need bands per run:
    //   1. accept path → stitched onto the AcceptedTask row,
    //   2. notify path → embedded in the unmatched-task email body so the
    //      recipient sees the full word-count breakdown without clicking
    //      through to the portal. (Previously notify mails carried only
    //      project/client/WC and no leverage detail.)
    // Both paths share a single batched invoke of symfonieGetTaskAnalysis.
    // Helper failure is non-fatal — accepts save with band=0, mails ship
    // without the leverage grid section.
    const candidateAnalysisIds = [];
    for (const raw of rawTasks) {
      const id = Number(raw.Id);
      if (existingIds.has(id)) continue;
      const previewTask = {
        project_name: raw.Project?.Name || '',
        task_name: raw.Name || '',
        source_language: raw.SourceLanguageCode || '',
        target_language: raw.TargetLanguageCode || '',
      };
      // Accept candidate: rule chain might consume it.
      const isAcceptCandidate = rules.some(r => r.action === 'accept' && matchesRule(r, previewTask));
      // Notify candidate: NO rule matches at all → goes to notifyNewTask.
      // (We can't perfectly predict numeric-field rules without bands, but
      // those rules don't influence whether bands are NEEDED — the matcher
      // ignores undefined fields.)
      const willNotify = !rules.some(r => matchesRule(r, previewTask));
      if (isAcceptCandidate || willNotify) candidateAnalysisIds.push(id);
    }

    const bandsByTaskId = {};
    if (candidateAnalysisIds.length > 0) {
      try {
        // Use the calling user's context (admin / scheduled). asServiceRole.functions.invoke
        // surfaces a synthetic 'service+...' user the downstream admin gate rejects with 403.
        const aRes = await base44.functions.invoke('symfonieGetTaskAnalysis', {
          task_ids: candidateAnalysisIds,
        });
        const analysisResults = aRes?.data?.results || {};
        for (const [id, payload] of Object.entries(analysisResults)) {
          if (payload?.analysis_found) bandsByTaskId[Number(id)] = payload;
        }
      } catch (e) {
        console.error('Batch WordCountAnalyses fetch failed:', e.message);
      }
    }

    // MTPE-aligned weighted WC, fallback formula. Used ONLY when Symfonie
    // didn't emit a native CalculatedQuantity (older parsers, manual tasks).
    // Source-of-truth is symfonie_calculated_qty when present — it reflects
    // the customer's actual per-band grid (Amazon vs. Adloc vs. Apple all
    // differ); our generic formula is a best-effort approximation.
    const computeWeightedWcFallback = (b) =>
      (Number(b.lev_9599) || 0) * 0.2 +
      (Number(b.lev_8594) || 0) * 0.35 +
      (Number(b.lev_7584) || 0) * 0.45 +
      ((Number(b.lev_5074) || 0) + (Number(b.lev_no_match) || 0)) * 0.6;

    // Fetch the vendor financial breakdown for a single accepted task.
    // Symfonie wire shape: /Tasks({id})?$expand=PurchaseOrders($expand=Prices)
    // We take the most-recent PO and its first Price row. PartnerCurrency
    // identifies vendor's settlement currency; UsdPrice is the dollar amount
    // we'll actually invoice. Returns null on any failure — non-fatal.
    async function fetchVendorPayment(taskId) {
      try {
        const url = `${BASE_URL}/Tasks(${taskId})?$expand=PurchaseOrders($expand=Prices)`;
        const r = await fetch(url, { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' } });
        if (!r.ok) return null;
        const body = await r.json().catch(() => null);
        const pos = body?.PurchaseOrders || [];
        if (pos.length === 0) return null;
        // Most-recent PO wins (by Id desc — Symfonie IDs are auto-increment).
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
      } catch {
        return null;
      }
    }

    for (const raw of rawTasks) {
      const taskId = Number(raw.Id);

      if (existingIds.has(taskId)) {
        results.skipped.push(taskId);
        continue;
      }

      // Extract price: sum of MaxUsd from FinanceRows (most meaningful cost indicator).
      // Word count: pick the FinanceRow whose BillingUnit is "Word".
      // BillingUnits enum (Symfonie V5): 0=Hour, 1=Page, 2=Piece, 3=Segment, 4=Word, 5=Percentage,
      // 6=Character, 7=Minute, 8=Other, 9=Line. Source: /Api/help/V5/enum/BillingUnits
      // The previous code matched value `1` thinking it was Words — but `1` is `Page`, so
      // word_count was always 0 and word-count-based rules never fired.
      const financeRows = raw.FinanceRows || [];
      const wordRow = financeRows.find(r => r.BillingUnit === 4 || r.BillingUnit === 'Word');
      const wordCount = Number(wordRow?.Quantity) || 0;
      const totalPrice = financeRows.reduce((sum, r) => sum + (Number(r.MaxUsd) || 0), 0);

      const projectInfo = raw.Project?.Id ? projectById.get(raw.Project.Id) : null;
      const jobInfo = raw.JobId ? jobById.get(raw.JobId) : null;
      const pm = projectInfo?.ProjectManagerId ? userById.get(projectInfo.ProjectManagerId) : null;

      const task = {
        task_id: taskId,
        client_id: portalClientId,
        task_name: raw.Name || '',
        project_name: raw.Project?.Name || raw.JobName || raw.ProjectName || '',
        client_name: projectInfo?.Customer?.Name || '',
        source_language: raw.SourceLanguageCode || '',
        target_language: raw.TargetLanguageCode || '',
        word_count: wordCount,
        price: totalPrice,
        due_date: raw.DueDate || null,
        accepted_at: new Date().toISOString(),
        matched_rule: null,
        status: 'skipped',
        portal: 'symfonie',
        sheets_synced: false,
        workflow_name: raw.WorkflowName || '',
        project_manager_first_name: pm?.FirstName || '',
        project_manager_last_name: pm?.LastName || '',
        // Belazy parity fields
        symfonie_code: projectInfo?.Code || '',
        symfonie_link: raw.JobId ? `https://projects.moravia.com/Jobs/Detail/${raw.JobId}#task-${taskId}` : '',
        order_date: raw.OrderDate || null,
        job_id: raw.JobId || null,
        job_identifier: jobInfo?.Identifier || '',
        project_id: raw.Project?.Id || null,
      };

      // Find first matching rule (rules sorted by priority asc)
      let matchedRule = null;
      for (const rule of rules) {
        if (matchesRule(rule, task)) {
          matchedRule = rule;
          break;
        }
      }

      if (!matchedRule) {
        // No rule matched — skip (don't touch the task). Fire a notification
        // so a human gets a one-click accept link by email if any
        // NotificationRule matches this task. Fire-and-forget: notification
        // failure must NEVER block the run.
        results.skipped.push({ id: taskId, name: raw.Name, project_name: task.project_name, source_language: task.source_language, target_language: task.target_language });
        console.log(`Task ${taskId} "${raw.Name}": no matching rule, skipped`);

        // Enrich the notify payload with leverage bands + weighted WC so the
        // email body shows the full word-count breakdown grid. Pulled from
        // the shared batched analysis above; if the analysis was missing
        // upstream we simply ship the mail without the grid.
        const notifyPayload = { ...task };
        const a = bandsByTaskId[taskId];
        if (a) {
          // Source-of-truth WWC: Symfonie's CalculatedQuantity (customer's
          // real grid) when present, else our generic fallback formula.
          const wwc = (typeof a.symfonie_calculated_qty === 'number' && a.symfonie_calculated_qty > 0)
            ? a.symfonie_calculated_qty
            : computeWeightedWcFallback(a);
          Object.assign(notifyPayload, {
            lev_context: a.lev_context, lev_rep: a.lev_rep, lev_match100: a.lev_match100,
            lev_9599: a.lev_9599, lev_8594: a.lev_8594, lev_7584: a.lev_7584,
            lev_5074: a.lev_5074, lev_no_match: a.lev_no_match,
            parser_type: a.parser_type || '',
            weighted_wc: wwc,
            symfonie_calculated_qty: a.symfonie_calculated_qty || null,
          });
        }

        // Use regular functions.invoke — asServiceRole.functions.invoke is
        // rejected by the platform's invoke layer with a blanket 403 before
        // reaching the target function (verified during handleDueDateChange
        // debug). The scheduled-context invoke passes through and
        // notifyNewTask's permissive auth gate accepts the service caller.
        base44.functions.invoke('notifyNewTask', {
          portal: 'symfonie',
          task_id: taskId,
          task_payload: notifyPayload,
        }).catch((e) => console.error('notifyNewTask failed:', e.message));
        continue;
      }

      task.matched_rule = matchedRule.name;

      if (matchedRule.action === 'accept') {
        task.status = 'accepted';

        const cmdResult = await executeTaskCommand(taskId, 'Accept', token);
        if (!cmdResult.ok) {
          task.status = 'error';
          const saved = await base44.asServiceRole.entities.AcceptedTask.create(task);
          results.errors.push({ id: taskId, name: raw.Name, rule: matchedRule.name, error: cmdResult.error });
          console.error(`Task ${taskId} Accept failed:`, cmdResult.error);
          continue;
        }

        console.log(`Task ${taskId} "${raw.Name}" accepted via rule "${matchedRule.name}"`);

        // Belazy parity: stitch pre-resolved leverage bands onto this task.
        // Resolved in a single batched invoke above — see `bandsByTaskId`.
        const a = bandsByTaskId[taskId];
        if (a) {
          // Source-of-truth WWC: Symfonie's CalculatedQuantity (customer's
          // real grid) when present, else our generic fallback formula.
          const wwc = (typeof a.symfonie_calculated_qty === 'number' && a.symfonie_calculated_qty > 0)
            ? a.symfonie_calculated_qty
            : computeWeightedWcFallback(a);
          Object.assign(task, {
            lev_context: a.lev_context, lev_rep: a.lev_rep, lev_match100: a.lev_match100,
            lev_9599: a.lev_9599, lev_8594: a.lev_8594, lev_7584: a.lev_7584,
            lev_5074: a.lev_5074, lev_no_match: a.lev_no_match,
            parser_type: a.parser_type || '',
            weighted_wc: wwc,
            symfonie_calculated_qty: a.symfonie_calculated_qty || null,
          });
        }

        // Vendor financial breakdown (Symfonie PurchaseOrder.Prices). Only
        // fetched for tasks we're actually accepting — pre-batching POs for
        // every Order-state task would be ~95% wasted calls.
        const vendorPayment = await fetchVendorPayment(taskId);
        if (vendorPayment) task.vendor_payment = vendorPayment;

        // Project Notes — BMS-facing brief from Project.Notes. projectInfo
        // was resolved up-front in the enrichment batch; just read the field.
        if (projectInfo?.Notes) task.project_notes = projectInfo.Notes;

        const saved = await base44.asServiceRole.entities.AcceptedTask.create(task);

        // Faz 1/2 BMS pipeline: every accepted task MUST get a Project record + webhook fire,
        // otherwise downstream BMS never sees rule-accepted tasks (only manual ones).
        let project = null;
        try {
          project = await base44.asServiceRole.entities.Project.create({
            tenant_id: 'default',
            client_id: portalClientId,
            accepted_task_id: saved.id,
            portal: 'symfonie',
            external_id: `symfonie:${taskId}`,
            state: 'accepted',
            name: raw.Name || '',
            client_name: task.client_name || '',
            project_name: task.project_name || '',
            source_language: task.source_language || '',
            target_language: task.target_language || '',
            word_count: task.word_count || 0,
            price: task.price || 0,
            currency: 'USD',
            due_date: task.due_date || null,
            accepted_at: task.accepted_at,
            // BMS-facing financial + brief fields — surface at the Project
            // level so apiProjectsList/Get carry them without per-row joins.
            vendor_payment: task.vendor_payment || null,
            project_notes: task.project_notes || '',
            origin: task,
          });
          base44.functions.invoke('dispatchWebhook', {
            tenant_id: 'default', event: 'project.accepted', project_id: project.id,
          }).catch((e) => console.error('webhook dispatch failed:', e.message));
        } catch (e) {
          console.error(`Project create failed for task ${taskId}:`, e.message);
        }

        // Handoff: Dropbox'a indir + ProjectAttachment katalogu (basarisiz olsa bile accept bozulmasin)
        try {
          await base44.functions.invoke('symfonieDownloadAttachments', {
            task_id: taskId,
            task_name: raw.Name || '',
            project_name: task.project_name || '',
            account_name: task.client_name || 'Symfonie',
            project_id: project?.id || null,
            job_id: raw.JobId || null,
          });
        } catch (e) {
          console.error(`Handoff failed for task ${taskId}:`, e.message);
        }

        results.accepted.push({ id: taskId, name: raw.Name, rule: matchedRule.name });

      } else if (matchedRule.action === 'reject') {
        task.status = 'rejected';

        const cmdResult = await executeTaskCommand(taskId, 'Reject', token);
        if (!cmdResult.ok) {
          task.status = 'error';
          await base44.asServiceRole.entities.AcceptedTask.create(task);
          results.errors.push({ id: taskId, name: raw.Name, rule: matchedRule.name, error: cmdResult.error });
          console.error(`Task ${taskId} Reject failed:`, cmdResult.error);
          continue;
        }

        console.log(`Task ${taskId} "${raw.Name}" rejected via rule "${matchedRule.name}"`);
        await base44.asServiceRole.entities.AcceptedTask.create(task);
        results.rejected.push({ id: taskId, name: raw.Name, rule: matchedRule.name });
      }
    }

    // Batch sheet sync once per run — fire-and-forget; sheetsSyncPending picks up
    // every newly-created AcceptedTask via `sheets_synced: false` filter.
    if (results.accepted.length > 0) {
      base44.functions.invoke('sheetsSyncPending', {})
        .catch((e) => console.error('sheetsSyncPending trigger failed:', e.message));
    }

    console.log(`Finished: ${results.accepted.length} accepted, ${results.rejected.length} rejected, ${results.skipped.length} skipped, ${results.errors.length} errors`);

    // `results.skipped` is a mixed array — numbers (already-processed) and objects (no-rule-match).
    // Count numbers to derive how many tasks were genuinely new this run.
    const alreadyProcessedCount = results.skipped.filter(s => typeof s === 'number').length;

    // Happy-path auto-resolve: any open poll_failure for this portal is stale.
    base44.functions.invoke('resolveSystemIssues', { type: 'poll_failure', portal: 'symfonie' })
      .catch((e) => console.error('resolveSystemIssues failed:', e.message));

    return Response.json({
      success: true,
      summary: {
        total_in_order: rawTasks.length,
        new_tasks_seen: rawTasks.length - alreadyProcessedCount,
        accepted: results.accepted.length,
        rejected: results.rejected.length,
        skipped: results.skipped.length,
        errors: results.errors.length
      },
      details: results
    });

  } catch (error) {
    console.error('symfonieProcessTasks error:', error.message);
    try {
      const b = createClientFromRequest(req);
      b.functions.invoke('recordSystemIssue', {
        type: 'poll_failure',
        severity: 'warning',
        portal: 'symfonie',
        function_name: 'symfonieProcessTasks',
        dedup_key: 'poll',
        title: 'Symfonie poll failed',
        description: error.message,
      }).catch((e) => console.error('recordSystemIssue failed:', e.message));
    } catch { /* never mask the original error */ }
    return Response.json({ error: error.message }, { status: 500 });
  }
});