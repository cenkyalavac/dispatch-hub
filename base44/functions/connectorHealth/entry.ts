// Lightweight health probe for the app-level OAuth connectors the Hub depends
// on (Google Sheets, Dropbox). These aren't "Portals" — they're the plumbing
// every accept path needs to copy files to Dropbox and log rows to Sheets.
//
// The 12-day silent outage that motivated this endpoint was a Google Sheets
// connector that quietly went unauthorized: every sheetsSyncPending tick 500'd
// and nobody saw it because there was no surface showing connector state.
//
// Returns { connectors: [{ key, label, connected, error }] }. Read-only; admin
// or service caller. Never throws — a probe failure is reported as connected:false.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const PROBES = [
  { key: 'googlesheets', label: 'Google Sheets' },
  { key: 'dropbox', label: 'Dropbox' },
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    const isService = !user
      || user.is_service === true
      || (typeof user.email === 'string' && user.email.startsWith('service+'));
    if (!isService && user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const connectors = await Promise.all(PROBES.map(async (p) => {
      try {
        const conn = await base44.asServiceRole.connectors.getConnection(p.key);
        const ok = !!conn?.accessToken;
        return { key: p.key, label: p.label, connected: ok, error: ok ? null : 'No access token' };
      } catch (e) {
        return { key: p.key, label: p.label, connected: false, error: e.message };
      }
    }));

    return Response.json({ connectors, checked_at: new Date().toISOString() });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});