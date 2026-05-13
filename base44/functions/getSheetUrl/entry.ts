import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Returns the public Google Sheet URL for the configured log spreadsheet.
// Prefers a per-portal override (Portal.sheets_spreadsheet_id), then falls back
// to the global GOOGLE_SHEETS_SPREADSHEET_ID secret.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    await base44.auth.me().catch(() => null);

    const portals = await base44.asServiceRole.entities.Portal.list();
    const p = portals.find(p => p.sheets_spreadsheet_id);
    if (!p) {
      return Response.json({ url: null, error: 'No portal has a spreadsheet configured' });
    }
    return Response.json({ url: `https://docs.google.com/spreadsheets/d/${p.sheets_spreadsheet_id}` });
  } catch (error) {
    return Response.json({ url: null, error: error.message }, { status: 500 });
  }
});