import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Append unsynced AcceptedTasks to the right Google Sheet.
// Destination resolution order per task:
//   1. First matching SheetRoute (active, by priority asc) for that portal
//   2. Portal's default sheets_spreadsheet_id / sheets_tab_name
//
// Row shape:
//   - If the task's portal has any active SheetColumnMapping rows: dynamic
//     columns in `order` ascending. Source value = task[source_field].
//   - Otherwise: legacy fixed 11-column schema.

const LEGACY_HEADERS = ['Task ID','Task Name','Project Name','Client','Source Language','Target Language','Word Count','Price','Due Date','Accepted At','Matched Rule'];
const LEGACY_FIELDS  = ['task_id','task_name','project_name','client_name','source_language','target_language','word_count','price','due_date','accepted_at','matched_rule'];

function evalCondition(c, task) {
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

function matchRoute(route, task) {
  if (!route.conditions || route.conditions.length === 0) return true;
  return route.conditions.every(c => evalCondition(c, task));
}

function resolveDestination(task, routes, portal) {
  for (const r of routes) {
    if (r.portal !== task.portal) continue;
    if (matchRoute(r, task)) {
      return { spreadsheet_id: r.spreadsheet_id, tab_name: r.tab_name || '', via: r.name };
    }
  }
  if (portal?.sheets_spreadsheet_id) {
    return { spreadsheet_id: portal.sheets_spreadsheet_id, tab_name: portal.sheets_tab_name || '', via: 'default' };
  }
  return null;
}

function cellValue(task, field) {
  const v = task[field];
  if (v == null) return '';
  return v;
}

// When a mapping has source_field_2 set, sum the two numeric values.
// Falls back to source_field-only value if the second is empty.
function combinedValue(task, mapping) {
  if (!mapping.source_field_2) return cellValue(task, mapping.source_field);
  const a = Number(task[mapping.source_field]) || 0;
  const b = Number(task[mapping.source_field_2]) || 0;
  return a + b;
}

// Convert a column count to the Sheets A1 letter range (e.g. 1→A, 11→K, 27→AA).
function colLetter(n) {
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Auth gate: allows admin (manual sync from UI) and scheduled/system runs
    // (no user context). Rejects regular users — they can't write to sheets.
    const user = await base44.auth.me().catch(() => null);
    if (user !== null && user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlesheets');
    if (!accessToken) {
      return Response.json({ error: 'Google Sheets connector not authorized' }, { status: 400 });
    }

    const [portals, routes, allTasks, allMappings, friendlyRows] = await Promise.all([
      base44.asServiceRole.entities.Portal.list(),
      base44.asServiceRole.entities.SheetRoute.filter({ is_active: true }, 'priority', 500),
      base44.asServiceRole.entities.AcceptedTask.filter(
        { sheets_synced: false, status: 'accepted' },
        'created_date',
        500
      ),
      base44.asServiceRole.entities.SheetColumnMapping.filter({ is_active: true }, 'order', 1000),
      base44.asServiceRole.entities.FriendlyName.list('-created_date', 2000).catch(() => []),
    ]);

    if (allTasks.length === 0) {
      return Response.json({ success: true, synced: 0, message: 'No records to sync' });
    }

    const portalByKey = new Map(portals.map(p => [p.key, p]));

    // Pre-enrich every task with friendly_* fields so SheetColumnMapping
    // source_field='friendly_project_name' (etc.) resolves to a real value
    // at write time. Unmatched values fall through to the raw name.
    const FRIENDLY_TYPE_FIELDS = {
      client:   { nameField: 'client_name',   idField: null },
      account:  { nameField: 'account_name',  idField: 'account_id' },
      project:  { nameField: 'project_name',  idField: 'project_id' },
      workflow: { nameField: 'workflow_name', idField: null },
    };
    const resolveFriendly = (task, type) => {
      const f = FRIENDLY_TYPE_FIELDS[type];
      if (!f) return '';
      const rawName = task[f.nameField] != null ? String(task[f.nameField]) : '';
      const rawId = f.idField && task[f.idField] != null ? String(task[f.idField]) : '';
      const portalKey = task.portal || '';
      const candidates = friendlyRows
        .filter((r) => r.is_active !== false && r.type === type && (r.portal === portalKey || r.portal === '*'))
        .sort((a, b) => (a.portal === '*' ? 1 : 0) - (b.portal === '*' ? 1 : 0));
      for (const r of candidates) {
        const match_by = r.match_by || 'name';
        const srcLc = String(r.source_value || '').toLowerCase();
        if (match_by === 'id' && rawId && srcLc === rawId.toLowerCase()) return r.display_name;
        if (match_by === 'name' && rawName && srcLc === rawName.toLowerCase()) return r.display_name;
      }
      return rawName;
    };
    for (const t of allTasks) {
      t.friendly_client_name   = resolveFriendly(t, 'client');
      t.friendly_account_name  = resolveFriendly(t, 'account');
      t.friendly_project_name  = resolveFriendly(t, 'project');
      t.friendly_workflow_name = resolveFriendly(t, 'workflow');
    }

    // Group active mappings by portal key, sorted by order.
    const mappingsByPortal = new Map();
    for (const m of allMappings) {
      if (!mappingsByPortal.has(m.portal)) mappingsByPortal.set(m.portal, []);
      mappingsByPortal.get(m.portal).push(m);
    }
    for (const [, list] of mappingsByPortal) list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    const buildRow = (t) => {
      const mappings = mappingsByPortal.get(t.portal);
      if (mappings && mappings.length > 0) {
        return mappings.map(m => combinedValue(t, m));
      }
      return LEGACY_FIELDS.map(f => cellValue(t, f));
    };

    const columnsFor = (portalKey) => {
      const mappings = mappingsByPortal.get(portalKey);
      return mappings && mappings.length > 0 ? mappings.length : LEGACY_HEADERS.length;
    };

    // Group tasks by destination (spreadsheet + tab) so each Sheet gets one batched append.
    const buckets = new Map();
    const skipped = [];

    for (const t of allTasks) {
      const dest = resolveDestination(t, routes, portalByKey.get(t.portal || 'symfonie'));
      if (!dest) {
        skipped.push({ task_id: t.task_id, portal: t.portal, reason: 'No spreadsheet configured' });
        continue;
      }
      const key = `${dest.spreadsheet_id}::${dest.tab_name}::${t.portal}`;
      if (!buckets.has(key)) buckets.set(key, { dest, portalKey: t.portal, tasks: [] });
      buckets.get(key).tasks.push(t);
    }

    let synced = 0;
    let skippedDuplicates = 0;
    const writes = [];

    // Duplicate-prevention pipeline (per bucket):
    //   1. CLAIM   — flip sheets_synced=true BEFORE append, so an overlapping
    //                cron run won't re-fetch these tasks. Closes the race
    //                window where two runs both see sheets_synced=false.
    //   2. READ    — scan column A of the destination tab to find task_ids
    //                already present. Defends against pre-existing duplicates
    //                and any race that slipped through (e.g. claim already
    //                committed but a prior run's append landed first).
    //   3. APPEND  — only rows whose task_id is NOT already in the sheet.
    //   4. ROLLBACK on append failure — flip sheets_synced back to false so
    //                the next run retries.

    // Throttled bulk update — entity API can choke when 500 tasks are updated
    // in a single Promise.all. Chunk into 25-row batches; sequential between
    // chunks, parallel within. Same shape used for rollback below.
    const CHUNK = 25;
    const bulkUpdateSheetsSynced = async (taskList, value) => {
      for (let i = 0; i < taskList.length; i += CHUNK) {
        const slice = taskList.slice(i, i + CHUNK);
        await Promise.all(
          slice.map(t =>
            base44.asServiceRole.entities.AcceptedTask
              .update(t.id, { sheets_synced: value })
              .catch((e) => console.error(`AcceptedTask.update(${t.id}, sheets_synced=${value}) failed:`, e.message))
          )
        );
      }
    };

    for (const [, { dest, portalKey, tasks }] of buckets) {
      const colCount = columnsFor(portalKey);
      const colRange = `A:${colLetter(colCount)}`;
      const range = dest.tab_name ? `${encodeURIComponent(dest.tab_name)}!${colRange}` : colRange;

      // 1. CLAIM — mark all candidate tasks as synced before touching Sheets.
      //    A concurrent run's filter({sheets_synced:false}) will skip them.
      await bulkUpdateSheetsSynced(tasks, true);

      // 2. READ — what's already in column A of this tab?
      //    Sheets row-count is bounded (typical: hundreds to a few thousand);
      //    this single GET is cheap compared to one-per-task lookups.
      const tabRef = dest.tab_name ? `${encodeURIComponent(dest.tab_name)}!A:A` : 'A:A';
      const readUrl = `https://sheets.googleapis.com/v4/spreadsheets/${dest.spreadsheet_id}/values/${tabRef}`;
      const readRes = await fetch(readUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });
      let existingIds = new Set();
      if (readRes.ok) {
        const readData = await readRes.json();
        for (const row of (readData.values || [])) {
          const v = row?.[0];
          if (v != null && v !== '') existingIds.add(String(v));
        }
      } else {
        // Read failure isn't fatal — log and proceed with append (preserves
        // pre-guard behaviour). Rollback path below still handles append errors.
        console.warn(`Sheets read failed for ${dest.spreadsheet_id} (proceeding without dedup):`, readRes.status);
      }

      // 3. Filter out tasks whose task_id is already in the sheet.
      const tasksToAppend = [];
      const alreadyInSheet = [];
      for (const t of tasks) {
        if (existingIds.has(String(t.task_id ?? ''))) {
          alreadyInSheet.push(t);
        } else {
          tasksToAppend.push(t);
        }
      }
      skippedDuplicates += alreadyInSheet.length;
      for (const t of alreadyInSheet) {
        skipped.push({ task_id: t.task_id, portal: t.portal, reason: 'already in sheet (dedup)' });
      }

      if (tasksToAppend.length === 0) {
        // Nothing new to append — claim already done, move on.
        continue;
      }

      // 4. APPEND the remaining (new) tasks.
      const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${dest.spreadsheet_id}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
      const res = await fetch(appendUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: tasksToAppend.map(buildRow) })
      });

      if (!res.ok) {
        const err = await res.text();
        console.error(`Sheets append failed for ${dest.spreadsheet_id}:`, res.status, err);
        const reason = `HTTP ${res.status}`;
        // ROLLBACK the claim so the next run retries — throttled.
        await bulkUpdateSheetsSynced(tasksToAppend, false);
        for (const t of tasksToAppend) skipped.push({ task_id: t.task_id, portal: t.portal, reason, _failed_task: t });
        continue;
      }

      writes.push({ via: dest.via, portal: portalKey, count: tasksToAppend.length, columns: colCount });
      synced += tasksToAppend.length;
    }

    // Surface sheet-write failures to the bell menu so silent data loss is
    // visible. We only notify for "real" failures (HTTP errors with a captured
    // task object) — "No spreadsheet configured" is a config-level issue
    // already visible on the portal card and would spam the inbox.
    //
    // Idempotency: each AcceptedTask.id gets at most one open notification.
    // Cron runs every 5 minutes; without this guard, a wedged sheet would
    // produce 288 bell entries per day per task.
    // Per-task idempotency check: one filter call per failed task. Avoids
    // depending on $in operator support in the entity API — if the lookup
    // fails for any reason, we err on the side of NOT spamming the bell
    // (treat as "already notified").
    let notified = 0;
    const realFailures = skipped.filter((s) => s._failed_task);
    for (const s of realFailures) {
      const t = s._failed_task;
      const existing = await base44.asServiceRole.entities.UserNotification
        .filter({ accepted_task_id: t.id }, '-created_date', 10)
        .catch(() => null);
      if (existing === null) continue; // lookup failed — skip to avoid spam
      const hasOpenAlert = existing.some(
        (n) => !n.read_at && (n.body || '').startsWith('Sheet sync failed')
      );
      if (hasOpenAlert) continue;
      await base44.asServiceRole.entities.UserNotification.create({
        type: 'info',
        severity: 'warning',
        title: 'Sheet sync failed',
        body: `Sheet sync failed (${s.reason}) — ${t.portal} #${t.task_id} ${t.task_name || ''}`.trim(),
        portal: t.portal,
        task_id: String(t.task_id ?? ''),
        accepted_task_id: t.id,
        link_url: `/tasks?id=${t.id}`,
      }).catch((e) => console.error('UserNotification create failed:', e.message));
      notified++;
    }

    // Strip internal _failed_task before returning (kept only for notification logic above).
    const skippedOut = skipped.map(({ _failed_task, ...rest }) => rest);
    return Response.json({ success: true, synced, skipped_duplicates: skippedDuplicates, writes, skipped: skippedOut, notified });

  } catch (error) {
    console.error('sheetsSyncPending error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});