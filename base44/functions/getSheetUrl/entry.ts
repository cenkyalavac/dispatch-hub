import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Returns the public Google Sheet URL for the configured log spreadsheet.
// Prefers a per-portal override (Portal.sheets_spreadsheet_id), then falls back
// to the global GOOGLE_SHEETS_SPREADSHEET_ID secret.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    await base44.auth.me().catch(() => null);

    let sheetId = null;
    try {
      const portals = await base44.asServiceRole.entities.Portal.list();
      const p = portals.find(p => p.sheets_spreadsheet_id);
      if (p) sheetId = p.sheets_spreadsheet_id;
    } catch (_) { /* ignore */ }

    if (!sheetId) sheetId = Deno.env.get('GOOGLE_SHEETS_SPREADSHEET_ID') || null;

    if (!sheetId) {
      return Response.json({ url: null, error: 'No spreadsheet configured' });
    }
    return Response.json({ url: `https://docs.google.com/spreadsheets/d/${sheetId}` });
  } catch (error) {
    return Response.json({ url: null, error: error.message }, { status: 500 });
  }
});