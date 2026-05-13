import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Write the header row into a specific portal's sheet.
// portal_key is required — no global default.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { portal_key } = await req.json().catch(() => ({}));
    if (!portal_key) {
      return Response.json({ error: 'portal_key is required' }, { status: 400 });
    }

    const portals = await base44.asServiceRole.entities.Portal.filter({ key: portal_key });
    const portal = portals[0];
    if (!portal) return Response.json({ error: `Portal "${portal_key}" not found` }, { status: 404 });

    const spreadsheetId = portal.sheets_spreadsheet_id;
    if (!spreadsheetId) {
      return Response.json({ error: 'This portal has no sheets_spreadsheet_id configured' }, { status: 400 });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlesheets');
    if (!accessToken) return Response.json({ error: 'Google Sheets connector not authorized' }, { status: 400 });

    const tab = portal.sheets_tab_name || '';
    const range = tab ? `${encodeURIComponent(tab)}!A1:K1` : 'A1:K1';

    const headers = [
      'Task ID', 'Task Name', 'Project Name', 'Client', 'Source Language', 'Target Language',
      'Word Count', 'Price', 'Due Date', 'Accepted At', 'Matched Rule'
    ];

    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`,
      {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: [headers] })
      }
    );

    if (!res.ok) {
      const err = await res.text();
      return Response.json({ error: 'Failed to write header', status: res.status, details: err }, { status: 400 });
    }

    return Response.json({ success: true, message: `Header row created for ${portal.name}` });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});