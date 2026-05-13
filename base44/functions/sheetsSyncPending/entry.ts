import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Append unsynced AcceptedTasks to each portal's configured Google Sheet.
// Spreadsheet ID and tab name now live on Portal entity — no global secret.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlesheets');
    if (!accessToken) {
      return Response.json({ error: 'Google Sheets connector not authorized' }, { status: 400 });
    }

    const portals = await base44.asServiceRole.entities.Portal.list();
    const portalByKey = new Map(portals.map(p => [p.key, p]));

    const allTasks = await base44.asServiceRole.entities.AcceptedTask.filter(
      { sheets_synced: false, status: 'accepted' },
      'created_date',
      500
    );

    if (allTasks.length === 0) {
      return Response.json({ success: true, synced: 0, message: 'No records to sync' });
    }

    // Group tasks by portal so each portal writes to its own sheet.
    const byPortal = new Map();
    for (const t of allTasks) {
      const key = t.portal || 'symfonie';
      if (!byPortal.has(key)) byPortal.set(key, []);
      byPortal.get(key).push(t);
    }

    const buildRow = (t) => [
      t.task_id, t.task_name || '', t.project_name || '', t.client_name || '',
      t.source_language || '', t.target_language || '', t.word_count || '',
      t.price || '', t.due_date || '', t.accepted_at || '', t.matched_rule || ''
    ];

    let synced = 0;
    const skipped = [];

    for (const [portalKey, tasks] of byPortal) {
      const portal = portalByKey.get(portalKey);
      const spreadsheetId = portal?.sheets_spreadsheet_id;
      if (!spreadsheetId) {
        skipped.push({ portal: portalKey, count: tasks.length, reason: 'No spreadsheet configured on portal' });
        continue;
      }
      const tab = portal?.sheets_tab_name || '';
      const range = tab ? `${encodeURIComponent(tab)}!A:K` : 'A:K';
      const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

      const res = await fetch(appendUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: tasks.map(buildRow) })
      });

      if (!res.ok) {
        const err = await res.text();
        console.error(`Sheets append failed for ${portalKey}:`, res.status, err);
        skipped.push({ portal: portalKey, count: tasks.length, reason: `HTTP ${res.status}` });
        continue;
      }

      await Promise.all(
        tasks.map(t => base44.asServiceRole.entities.AcceptedTask.update(t.id, { sheets_synced: true }))
      );
      synced += tasks.length;
    }

    return Response.json({ success: true, synced, skipped });

  } catch (error) {
    console.error('sheetsSyncPending error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});