// Updates the cells of a single AcceptedTask's row on Google Sheets.
//
// Called by handleDueDateChange when a due_date moves on an already-synced
// task. We can't insert a new row (that would double-list the task) and the
// default sheetsSyncPending only handles new tasks, so this function locates
// the task's existing row by Task ID and rewrites it.
//
// Row detection: scans column A (Task ID by both legacy schema and most
// portal column-mappings) on the destination tab and matches against
// task.task_id. If no row is found, this is a no-op (the row was deleted
// or this task was never synced).
//
// Admin-only: caller is another backend function via asServiceRole, or
// the user is a logged-in admin invoking manually.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const LEGACY_FIELDS = ['task_id','task_name','project_name','client_name','source_language','target_language','word_count','price','due_date','accepted_at','matched_rule'];

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

function resolveDestination(task, routes, portal) {
  for (const r of routes) {
    if (r.portal !== task.portal) continue;
    if (!r.conditions || r.conditions.length === 0 || r.conditions.every(c => evalCondition(c, task))) {
      return { spreadsheet_id: r.spreadsheet_id, tab_name: r.tab_name || '' };
    }
  }
  if (portal?.sheets_spreadsheet_id) {
    return { spreadsheet_id: portal.sheets_spreadsheet_id, tab_name: portal.sheets_tab_name || '' };
  }
  return null;
}

function colLetter(n) {
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function cellValue(task, field) {
  const v = task[field];
  if (v == null) return '';
  return v;
}

function combinedValue(task, mapping) {
  if (!mapping.source_field_2) return cellValue(task, mapping.source_field);
  const a = Number(task[mapping.source_field]) || 0;
  const b = Number(task[mapping.source_field_2]) || 0;
  return a + b;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    // Allow: admin users (manual), scheduled/service callers (no user
    // context), and the synthetic 'service+...' surfaced by nested invokes.
    // handleDueDateChange (entity automation) hits us via the no-user-context
    // path; that's the most common caller in production.
    const isService = !user
      || user.is_service === true
      || (typeof user.email === 'string' && user.email.startsWith('service+'));
    if (!isService && user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { accepted_task_id } = await req.json().catch(() => ({}));
    if (!accepted_task_id) {
      return Response.json({ error: 'accepted_task_id is required' }, { status: 400 });
    }

    const task = await base44.asServiceRole.entities.AcceptedTask.get(accepted_task_id).catch(() => null);
    if (!task) return Response.json({ error: 'AcceptedTask not found' }, { status: 404 });
    if (!task.sheets_synced) {
      return Response.json({ skipped: 'task not yet synced to sheets' });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlesheets');
    if (!accessToken) {
      return Response.json({ error: 'Google Sheets connector not authorized' }, { status: 400 });
    }

    const [portals, routes, allMappings, friendlyRows] = await Promise.all([
      base44.asServiceRole.entities.Portal.list(),
      base44.asServiceRole.entities.SheetRoute.filter({ is_active: true }, 'priority', 500),
      base44.asServiceRole.entities.SheetColumnMapping.filter({ is_active: true, portal: task.portal }, 'order', 200),
      base44.asServiceRole.entities.FriendlyName.list('-created_date', 2000).catch(() => []),
    ]);

    // Enrich the task with friendly_* fields (same logic as sheetsSyncPending).
    const FRIENDLY = {
      client:   { nameField: 'client_name',   idField: null },
      account:  { nameField: 'account_name',  idField: 'account_id' },
      project:  { nameField: 'project_name',  idField: 'project_id' },
      workflow: { nameField: 'workflow_name', idField: null },
    };
    const resolveFriendly = (t, type) => {
      const f = FRIENDLY[type];
      if (!f) return '';
      const rawName = t[f.nameField] != null ? String(t[f.nameField]) : '';
      const rawId = f.idField && t[f.idField] != null ? String(t[f.idField]) : '';
      const portalKey = t.portal || '';
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
    task.friendly_client_name   = resolveFriendly(task, 'client');
    task.friendly_account_name  = resolveFriendly(task, 'account');
    task.friendly_project_name  = resolveFriendly(task, 'project');
    task.friendly_workflow_name = resolveFriendly(task, 'workflow');

    const portalByKey = new Map(portals.map(p => [p.key, p]));
    const dest = resolveDestination(task, routes, portalByKey.get(task.portal));
    if (!dest) return Response.json({ skipped: 'no destination configured' });

    const useDynamic = allMappings.length > 0;
    const fields = useDynamic ? allMappings.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)) : null;
    const colCount = useDynamic ? fields.length : LEGACY_FIELDS.length;
    const newRow = useDynamic
      ? fields.map(m => combinedValue(task, m))
      : LEGACY_FIELDS.map(f => cellValue(task, f));

    // Read column A of the destination tab to find the row matching this task_id.
    const tabRef = dest.tab_name ? `${encodeURIComponent(dest.tab_name)}!A:A` : 'A:A';
    const readUrl = `https://sheets.googleapis.com/v4/spreadsheets/${dest.spreadsheet_id}/values/${tabRef}`;
    const readRes = await fetch(readUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    if (!readRes.ok) {
      const err = await readRes.text();
      return Response.json({ error: `Sheets read failed: HTTP ${readRes.status} ${err}` }, { status: 502 });
    }
    const readData = await readRes.json();
    const rows = readData.values || [];
    const target = String(task.task_id ?? '');
    let rowIndex = -1; // 1-based for A1 notation
    for (let i = 0; i < rows.length; i++) {
      if (String(rows[i][0] ?? '') === target) {
        rowIndex = i + 1;
        break;
      }
    }
    if (rowIndex === -1) {
      return Response.json({ skipped: `task_id ${target} not found in sheet` });
    }

    // Overwrite the row.
    const writeRange = dest.tab_name
      ? `${encodeURIComponent(dest.tab_name)}!A${rowIndex}:${colLetter(colCount)}${rowIndex}`
      : `A${rowIndex}:${colLetter(colCount)}${rowIndex}`;
    const writeUrl = `https://sheets.googleapis.com/v4/spreadsheets/${dest.spreadsheet_id}/values/${writeRange}?valueInputOption=USER_ENTERED`;
    const writeRes = await fetch(writeUrl, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [newRow] }),
    });
    if (!writeRes.ok) {
      const err = await writeRes.text();
      return Response.json({ error: `Sheets write failed: HTTP ${writeRes.status} ${err}` }, { status: 502 });
    }

    return Response.json({ ok: true, row: rowIndex, columns: colCount });
  } catch (error) {
    console.error('sheetsUpdateTaskRow error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});