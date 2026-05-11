import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const spreadsheetId = Deno.env.get('GOOGLE_SHEETS_SPREADSHEET_ID');
    if (!spreadsheetId) {
      console.error('GOOGLE_SHEETS_SPREADSHEET_ID is missing');
      return Response.json({ error: 'GOOGLE_SHEETS_SPREADSHEET_ID is missing' }, { status: 400 });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlesheets');
    if (!accessToken) {
      console.error('Google Sheets access token not available');
      return Response.json({ error: 'Google Sheets connector not authorized' }, { status: 400 });
    }

    // Get all unsynced accepted tasks
    const allTasks = await base44.asServiceRole.entities.AcceptedTask.filter(
      { sheets_synced: false, status: 'accepted' },
      'created_date',
      500
    );

    console.log(`Found ${allTasks.length} unsynced tasks`);

    if (allTasks.length === 0) {
      return Response.json({ success: true, synced: 0, message: 'No records to sync' });
    }

    const rows = allTasks.map(t => [
      t.task_id,
      t.task_name || '',
      t.project_name || '',
      t.client_name || '',
      t.source_language || '',
      t.target_language || '',
      t.word_count || '',
      t.price || '',
      t.due_date || '',
      t.accepted_at || '',
      t.matched_rule || ''
    ]);

    // Batch append all rows at once - use a proper range (Sheet1!A:K)
    const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A:K:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

    const res = await fetch(appendUrl, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: rows })
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('Sheets append failed:', res.status, err);
      return Response.json({ error: 'Sheets write error', status: res.status, details: err }, { status: 400 });
    }

    const result = await res.json();
    console.log(`Sheets append succeeded. Updated range: ${result.updates?.updatedRange}, rows: ${result.updates?.updatedRows}`);

    // Mark all as synced
    await Promise.all(
      allTasks.map(t => base44.asServiceRole.entities.AcceptedTask.update(t.id, { sheets_synced: true }))
    );

    console.log(`Successfully synced ${allTasks.length} tasks to Sheets`);
    return Response.json({ success: true, synced: allTasks.length, updated_range: result.updates?.updatedRange });

  } catch (error) {
    console.error('sheetsSyncPending error:', error.message, error.stack);
    return Response.json({ error: error.message }, { status: 500 });
  }
});