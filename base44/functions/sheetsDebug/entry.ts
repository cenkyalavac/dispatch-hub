import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Debug tool: reads metadata + first 10 rows from the configured spreadsheet,
// so we can verify which file is actually being written to.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const spreadsheetId = Deno.env.get('GOOGLE_SHEETS_SPREADSHEET_ID');
    if (!spreadsheetId) return Response.json({ error: 'GOOGLE_SHEETS_SPREADSHEET_ID is missing' }, { status: 400 });

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlesheets');

    // 1) Metadata — title, owner, sheet names
    const metaRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=spreadsheetId,properties.title,sheets.properties(sheetId,title,gridProperties)`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    const meta = await metaRes.json();

    // 2) Read first 10 rows of the first sheet
    const firstSheet = meta.sheets?.[0]?.properties?.title || 'Sheet1';
    const valuesRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(firstSheet)}!A1:K10`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    const values = await valuesRes.json();

    // 3) Drive metadata (owner, web link)
    const driveRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${spreadsheetId}?fields=id,name,owners,webViewLink,createdTime,modifiedTime`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    const drive = driveRes.ok ? await driveRes.json() : { error: 'Drive metadata unavailable (drive.file scope only allows access to files created by this app)' };

    return Response.json({
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