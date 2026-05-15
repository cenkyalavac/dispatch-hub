import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Write the header row into a specific portal's sheet.
// portal_key is required — no global default.
// If the portal has active SheetColumnMapping rows, headers come from those
// (in `order` ascending). Otherwise fall back to the legacy fixed 11-column schema.

const LEGACY_HEADERS = ['Task ID','Task Name','Project Name','Client','Source Language','Target Language','Word Count','Price','Due Date','Accepted At','Matched Rule'];

function colLetter(n) {
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) {
      return Response.json({
        error: 'Your session has expired. Please refresh the page and sign in again before retrying.',
      }, { status: 401 });
    }
    // Admin gate — this endpoint writes to production Google Sheets and resets
    // header rows. Regular users must not be able to corrupt the log sheet.
    if (user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

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

    // Pick headers: custom mapping if defined, else legacy.
    const mappings = await base44.asServiceRole.entities.SheetColumnMapping.filter(
      { portal: portal_key, is_active: true }, 'order', 200
    );
    const headers = mappings.length > 0
      ? mappings.map(m => m.header || m.source_field)
      : LEGACY_HEADERS;

    const tab = (portal.sheets_tab_name || '').trim();
    const colRange = `A1:${colLetter(headers.length)}1`;
    // Sheets A1 notation: wrap tab in single quotes (escape any internal '),
    // then URL-encode the whole range exactly once. Skips the quoting when no
    // tab is configured (Sheets writes to the first/default sheet).
    const rawRange = tab ? `'${tab.replace(/'/g, "''")}'!${colRange}` : colRange;
    const range = encodeURIComponent(rawRange);

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
      // Return 200 with success:false so the frontend can read the body via res.data
      // instead of axios throwing on 4xx/5xx and losing the Sheets API error detail.
      return Response.json({
        success: false,
        error: `Sheets API ${res.status}: ${err.slice(0, 300)}`,
        details: err.slice(0, 500),
      });
    }

    return Response.json({
      success: true,
      message: `Header row created for ${portal.name}`,
      columns: headers.length,
      source: mappings.length > 0 ? 'custom' : 'legacy',
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});