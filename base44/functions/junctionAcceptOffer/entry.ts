import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const PROD_BASE = 'https://hypnos.welocalize.tools';

async function appendToSheets(base44, row) {
  try {
    const sheetId = Deno.env.get('GOOGLE_SHEETS_SPREADSHEET_ID');
    if (!sheetId) return;
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlesheets');
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Sayfa1!A:K:append?valueInputOption=USER_ENTERED`;
    await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [row] }),
    });
  } catch (e) {
    console.error('Sheets append failed:', e.message);
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { task_id, task_name, project_name, source_language, target_language, word_count, price, due_date } = await req.json();
    if (!task_id) return Response.json({ success: false, error: 'task_id is required' }, { status: 400 });

    const jwt = Deno.env.get('JUNCTION_JWT');
    const apiBase = Deno.env.get('JUNCTION_API_BASE') || PROD_BASE;
    if (!jwt) return Response.json({ success: false, error: 'JUNCTION_JWT not configured' });

    const r = await fetch(`${apiBase}/v1/offer/accept-bulk`, {
      method: 'PUT',
      headers: { 'x-pantheon-auth': jwt, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [Number(task_id)] }),
    });

    if (!r.ok) {
      const text = await r.text();
      return Response.json({ success: false, error: `Junction returned HTTP ${r.status}: ${text.slice(0, 200)}` });
    }

    const acceptedAt = new Date().toISOString();

    const savedTask = await base44.entities.AcceptedTask.create({
      portal: 'junction',
      task_id: Number(task_id),
      task_name: task_name || `Offer #${task_id}`,
      project_name: project_name || '',
      source_language: source_language || '',
      target_language: target_language || '',
      word_count: word_count || 0,
      price: price || 0,
      due_date: due_date || null,
      accepted_at: acceptedAt,
      matched_rule: 'Manual',
      status: 'accepted',
      sheets_synced: false,
    });

    // BMS Integration: project record for downstream BMS consumption.
    let project = null;
    try {
      project = await base44.asServiceRole.entities.Project.create({
        tenant_id: 'default',
        accepted_task_id: savedTask.id,
        portal: 'junction',
        external_id: `junction:${task_id}`,
        state: 'accepted',
        name: task_name || `Offer #${task_id}`,
        project_name: project_name || '',
        source_language: source_language || '',
        target_language: target_language || '',
        word_count: word_count || 0,
        price: price || 0,
        currency: 'USD',
        due_date: due_date || null,
        accepted_at: acceptedAt,
        origin: { task_id, task_name, project_name, source_language, target_language, word_count, price, due_date },
      });
      base44.asServiceRole.functions.invoke('dispatchWebhook', {
        tenant_id: 'default', event: 'project.accepted', project_id: project.id,
      }).catch((e) => console.error('webhook dispatch failed:', e.message));
    } catch (e) {
      console.error('Project create failed:', e.message);
    }

    await appendToSheets(base44, [
      acceptedAt,
      'junction',
      task_id,
      task_name || '',
      project_name || '',
      '',
      source_language || '',
      target_language || '',
      word_count || 0,
      price || 0,
      'Manual',
    ]);

    return Response.json({ success: true, accepted_at: acceptedAt, project_id: project?.id || null });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});