import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Append unsynced AcceptedTasks to the right Google Sheet.
// Destination resolution order per task:
//   1. First matching SheetRoute (active, by priority asc) for that portal
//   2. Portal's default sheets_spreadsheet_id / sheets_tab_name

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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlesheets');
    if (!accessToken) {
      return Response.json({ error: 'Google Sheets connector not authorized' }, { status: 400 });
    }

    const [portals, routes, allTasks] = await Promise.all([
      base44.asServiceRole.entities.Portal.list(),
      base44.asServiceRole.entities.SheetRoute.filter({ is_active: true }, 'priority', 500),
      base44.asServiceRole.entities.AcceptedTask.filter(
        { sheets_synced: false, status: 'accepted' },
        'created_date',
        500
      ),
    ]);

    if (allTasks.length === 0) {
      return Response.json({ success: true, synced: 0, message: 'No records to sync' });
    }

    const portalByKey = new Map(portals.map(p => [p.key, p]));

    // Group tasks by destination (spreadsheet + tab) so each Sheet gets one batched append.
    const buckets = new Map();
    const skipped = [];

    for (const t of allTasks) {
      const dest = resolveDestination(t, routes, portalByKey.get(t.portal || 'symfonie'));
      if (!dest) {
        skipped.push({ task_id: t.task_id, portal: t.portal, reason: 'No spreadsheet configured' });
        continue;
      }
      const key = `${dest.spreadsheet_id}::${dest.tab_name}`;
      if (!buckets.has(key)) buckets.set(key, { dest, tasks: [] });
      buckets.get(key).tasks.push(t);
    }

    const buildRow = (t) => [
      t.task_id, t.task_name || '', t.project_name || '', t.client_name || '',
      t.source_language || '', t.target_language || '', t.word_count || '',
      t.price || '', t.due_date || '', t.accepted_at || '', t.matched_rule || ''
    ];

    let synced = 0;
    const writes = [];

    for (const [, { dest, tasks }] of buckets) {
      const range = dest.tab_name ? `${encodeURIComponent(dest.tab_name)}!A:K` : 'A:K';
      const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${dest.spreadsheet_id}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

      const res = await fetch(appendUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: tasks.map(buildRow) })
      });

      if (!res.ok) {
        const err = await res.text();
        console.error(`Sheets append failed for ${dest.spreadsheet_id}:`, res.status, err);
        for (const t of tasks) skipped.push({ task_id: t.task_id, portal: t.portal, reason: `HTTP ${res.status}` });
        continue;
      }

      writes.push({ via: dest.via, count: tasks.length });
      await Promise.all(
        tasks.map(t => base44.asServiceRole.entities.AcceptedTask.update(t.id, { sheets_synced: true }))
      );
      synced += tasks.length;
    }

    return Response.json({ success: true, synced, writes, skipped });

  } catch (error) {
    console.error('sheetsSyncPending error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});