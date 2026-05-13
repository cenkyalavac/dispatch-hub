import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Debug tool: reads metadata + first 10 rows from a portal's configured spreadsheet.
// portal_key is required.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { portal_key } = await req.json().catch(() => ({}));
    if (!portal_key) return Response.json({ error: 'portal_key is required' }, { status: 400 });

    const portals = await base44.asServiceRole.entities.Portal.filter({ key: portal_key });
    const portal = portals[0];
    if (!portal) return Response.json({ error: `Portal "${portal_key}" not found` }, { status: 404 });

    const spreadsheetId = portal.sheets_spreadsheet_id;
    if (!spreadsheetId) {
      return Response.json({ error: 'This portal has no sheets_spreadsheet_id configured' }, { status: 400 });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlesheets');

    const metaRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=spreadsheetId,properties.title,sheets.properties(sheetId,title,gridProperties)`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    const meta = await metaRes.json();

    const firstSheet = portal.sheets_tab_name || meta.sheets?.[0]?.properties?.title || 'Sheet1';
    const valuesRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(firstSheet)}!A1:K10`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    const values = await valuesRes.json();

    const driveRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${spreadsheetId}?fields=id,name,owners,webViewLink,createdTime,modifiedTime`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    const drive = driveRes.ok ? await driveRes.json() : { error: 'Drive metadata unavailable' };

    return Response.json({
      portal_key,
      spreadsheet_id: spreadsheetId,
      title: meta.properties?.title,
      sheets: meta.sheets?.map(s => ({ name: s.properties.title, rows: s.properties.gridProperties?.rowCount })),
      first_sheet: firstSheet,
      first_10_rows: values.values || [],
      row_count: values.values?.length || 0,
      drive_metadata: drive,
      meta_status: metaRes.status,
      values_status: valuesRes.status,
    });
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
});