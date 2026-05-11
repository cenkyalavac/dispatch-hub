import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const spreadsheetId = Deno.env.get('GOOGLE_SHEETS_SPREADSHEET_ID');
    if (!spreadsheetId) return Response.json({ error: 'GOOGLE_SHEETS_SPREADSHEET_ID eksik' }, { status: 400 });

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlesheets');

    // Get all unsynced accepted tasks
    const allTasks = await base44.asServiceRole.entities.AcceptedTask.filter(
      { sheets_synced: false, status: 'accepted' },
      'created_date',
      500
    );

    console.log(`Found ${allTasks.length} unsynced tasks`);

    if (allTasks.length === 0) {
      return Response.json({ success: true, synced: 0, message: 'Sync edilecek kayıt yok' });
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

    // Batch append all rows at once
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A1:append?valueInputOption=USER_ENTERED`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: rows })
      }
    );

    if (!res.ok) {
      const err = await res.text();
      console.error('Sheets append failed:', res.status, err);
      return Response.json({ error: 'Sheets yazma hatası', details: err }, { status: 400 });
    }

    // Mark all as synced
    await Promise.all(
      allTasks.map(t => base44.asServiceRole.entities.AcceptedTask.update(t.id, { sheets_synced: true }))
    );

    console.log(`Successfully synced ${allTasks.length} tasks to Sheets`);
    return Response.json({ success: true, synced: allTasks.length });

  } catch (error) {
    console.error('sheetsSyncPending error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});