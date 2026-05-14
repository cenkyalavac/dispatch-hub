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

function evalSheetCondition(c, task) {
  const raw = task[c.field];
  const taskStr = String(raw ?? '').toLowerCase();
  const taskNum = Number(raw);
  const value = String(c.value ?? '').toLowerCase();
  const numVal = Number(c.value);
  switch (c.operator) {
    case 'contains':       return taskStr.includes(value);
    case 'not_contains':   return !taskStr.includes(value);
    case 'equals':         return taskStr === value;
    case 'starts_with':    return taskStr.startsWith(value);
    case 'in':             return value.split(',').map(v => v.trim()).filter(Boolean).includes(taskStr);
    case 'greater_than':   return taskNum > numVal;
    case 'less_than':      return taskNum < numVal;
    case 'greater_equal':  return taskNum >= numVal;
    case 'less_equal':     return taskNum <= numVal;
    default:               return true;
  }
}

function resolveSheetDestination(task, routes, portal) {
  for (const r of routes) {
    if (r.portal !== 'symfonie') continue;
    const conds = r.conditions || [];
    const matched = conds.length === 0 || conds.every(c => evalSheetCondition(c, task));
    if (matched) return { spreadsheet_id: r.spreadsheet_id, tab_name: r.tab_name || '' };
  }
  if (portal?.sheets_spreadsheet_id) {
    return { spreadsheet_id: portal.sheets_spreadsheet_id, tab_name: portal.sheets_tab_name || '' };
  }
  return null;
}

async function appendToSheets(base44, taskRecord, portal, routes) {
  const dest = resolveSheetDestination(taskRecord, routes || [], portal);
  if (!dest) return false;

  const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlesheets');
  const spreadsheetId = dest.spreadsheet_id;
  const tab = dest.tab_name;
  const range = tab ? `${encodeURIComponent(tab)}!A1:append` : 'A1:append';

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
    taskRecord.matched_rule || ''
  ];

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ values: [row] })
    }
  );
  if (!res.ok) {
    console.error('Sheets append failed:', res.status, await res.text());
    return false;
  }
  return true;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Auth: allow admin users and scheduled/system calls (no user context)
    const user = await base44.auth.me().catch(() => null);
    if (user !== null && user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    console.log('symfonieProcessTasks started, user:', user?.email || 'scheduled/system');

    // Load portal config + active sheet routes once — needed for Sheet routing in appendToSheets.
    const [portalRows, sheetRoutes] = await Promise.all([
      base44.asServiceRole.entities.Portal.filter({ key: 'symfonie' }),
      base44.asServiceRole.entities.SheetRoute.filter({ portal: 'symfonie', is_active: true }, 'priority', 200),
    ]);
    const portal = portalRows[0] || null;

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

    // 3. Fetch tasks in 'Order' state (awaiting acceptance) with Project and FinanceRows expanded
    // State eq 'Order' = TaskStates.Order (value=3) = "Ordered task" = tasks assigned to us, awaiting our Accept/Reject
    // Note: 'Project' is NOT a navigation property on TaskViewModel — removed from $expand
    // Use JobName/ProjectName fields directly on the task for project name
    const url = `${BASE_URL}/Tasks?$filter=State eq 'Order'&$expand=FinanceRows&$orderby=CreatedAt asc&$top=200`;
    const rawTasks = await fetchAllPages(url, token);
    console.log(`Found ${rawTasks.length} tasks in Order state`);

    // Faz 2: Resolve Customer/Account names via the Projects endpoint (Customer is inline on Projects, NOT on Tasks).
    // Without this, client_name on Project records stays empty and FieldMapping never gets a chance to fire.
    const projectIds = [...new Set(rawTasks.map(t => t.Project?.Id).filter(Boolean))];
    const customerByProject = new Map();
    if (projectIds.length > 0) {
      const chunks = [];
      for (let i = 0; i < projectIds.length; i += 20) chunks.push(projectIds.slice(i, i + 20));
      try {
        const batches = await Promise.all(chunks.map(async (chunk) => {
          const filter = chunk.map(id => `Id eq ${id}`).join(' or ');
          return fetchAllPages(
            `${BASE_URL}/Projects?$filter=${encodeURIComponent(filter)}&$top=${chunk.length}`,
            token
          );
        }));
        batches.flat().forEach(p => { if (p.Customer?.Name) customerByProject.set(p.Id, p.Customer.Name); });
      } catch (e) {
        // Don't block automation if customer resolution fails — just log and continue with empty client_name.
        console.error('Customer resolution failed:', e.message);
      }
    }

    // 4. Get already-processed task IDs to avoid re-processing
    // Use a Set of numeric task IDs from our AcceptedTask records
    const existing = await base44.asServiceRole.entities.AcceptedTask.list('-created_date', 2000);
    const existingIds = new Set(existing.map(t => Number(t.task_id)));
    console.log(`Already processed: ${existingIds.size} tasks`);

    const results = { accepted: [], rejected: [], skipped: [], errors: [] };

    for (const raw of rawTasks) {
      const taskId = Number(raw.Id);

      if (existingIds.has(taskId)) {
        results.skipped.push(taskId);
        continue;
      }

      // Extract price: sum of MaxUsd from FinanceRows (most meaningful cost indicator)
      // Word count: find the FinanceRow with BillingUnit = 'Words' (= 1)
      const financeRows = raw.FinanceRows || [];
      // BillingUnit comes as either a numeric code (1 = Words) or a string ("Words"/"Word").
      const wordRow = financeRows.find(r => r.BillingUnit === 1 || r.BillingUnit === 'Words' || r.BillingUnit === 'Word');
      const wordCount = Number(wordRow?.Quantity) || 0;
      const totalPrice = financeRows.reduce((sum, r) => sum + (Number(r.MaxUsd) || 0), 0);

      const clientName = (raw.Project?.Id && customerByProject.get(raw.Project.Id)) || '';
      const task = {
        task_id: taskId,
        task_name: raw.Name || '',
        project_name: raw.Project?.Name || raw.JobName || raw.ProjectName || '',
        client_name: clientName,
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
        service_tag: raw.ServiceTag || '',
        workflow_name: raw.WorkflowName || '',
        project_manager_first_name: raw.ProjectManager?.FirstName || raw.ProjectManagerFirstName || '',
        project_manager_last_name: raw.ProjectManager?.LastName || raw.ProjectManagerLastName || '',
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
        // No rule matched — skip (don't touch the task)
        results.skipped.push({ id: taskId, name: raw.Name, project_name: task.project_name, source_language: task.source_language, target_language: task.target_language });
        console.log(`Task ${taskId} "${raw.Name}": no matching rule, skipped`);
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
        const saved = await base44.asServiceRole.entities.AcceptedTask.create(task);

        const synced = await appendToSheets(base44, task, portal, sheetRoutes);
        if (synced) {
          await base44.asServiceRole.entities.AcceptedTask.update(saved.id, { sheets_synced: true });
        }

        // Faz 1/2 BMS pipeline: every accepted task MUST get a Project record + webhook fire,
        // otherwise downstream BMS never sees rule-accepted tasks (only manual ones).
        let project = null;
        try {
          project = await base44.asServiceRole.entities.Project.create({
            tenant_id: 'default',
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
            origin: task,
          });
          base44.asServiceRole.functions.invoke('dispatchWebhook', {
            tenant_id: 'default', event: 'project.accepted', project_id: project.id,
          }).catch((e) => console.error('webhook dispatch failed:', e.message));
        } catch (e) {
          console.error(`Project create failed for task ${taskId}:`, e.message);
        }

        // Handoff: Dropbox'a indir + ProjectAttachment katalogu (basarisiz olsa bile accept bozulmasin)
        try {
          await base44.asServiceRole.functions.invoke('symfonieDownloadAttachments', {
            task_id: taskId,
            task_name: raw.Name || '',
            project_name: task.project_name || '',
            account_name: task.client_name || 'Symfonie',
            project_id: project?.id || null,
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

    console.log(`Finished: ${results.accepted.length} accepted, ${results.rejected.length} rejected, ${results.skipped.length} skipped, ${results.errors.length} errors`);

    // `results.skipped` is a mixed array — numbers (already-processed) and objects (no-rule-match).
    // Count numbers to derive how many tasks were genuinely new this run.
    const alreadyProcessedCount = results.skipped.filter(s => typeof s === 'number').length;

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
    return Response.json({ error: error.message }, { status: 500 });
  }
});