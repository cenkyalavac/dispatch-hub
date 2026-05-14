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

// Convert a column count to the Sheets A1 letter range (e.g. 1→A, 11→K, 27→AA).
function colLetter(n) {
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlesheets');
    if (!accessToken) {
      return Response.json({ error: 'Google Sheets connector not authorized' }, { status: 400 });
    }

    const [portals, routes, allTasks, allMappings] = await Promise.all([
      base44.asServiceRole.entities.Portal.list(),
      base44.asServiceRole.entities.SheetRoute.filter({ is_active: true }, 'priority', 500),
      base44.asServiceRole.entities.AcceptedTask.filter(
        { sheets_synced: false, status: 'accepted' },
        'created_date',
        500
      ),
      base44.asServiceRole.entities.SheetColumnMapping.filter({ is_active: true }, 'order', 1000),
    ]);

    if (allTasks.length === 0) {
      return Response.json({ success: true, synced: 0, message: 'No records to sync' });
    }

    const portalByKey = new Map(portals.map(p => [p.key, p]));

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
        return mappings.map(m => cellValue(t, m.source_field));
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
    const writes = [];

    for (const [, { dest, portalKey, tasks }] of buckets) {
      const colCount = columnsFor(portalKey);
      const colRange = `A:${colLetter(colCount)}`;
      const range = dest.tab_name ? `${encodeURIComponent(dest.tab_name)}!${colRange}` : colRange;
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

      writes.push({ via: dest.via, portal: portalKey, count: tasks.length, columns: colCount });
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