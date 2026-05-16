// Junction count-only KPI fetcher — fan-out call for the dashboard.
//
// Uses the `$limit=0` trick verified live against hypnos.welocalize.tools:
// Junction returns { data: [], meta: { count: N } } and skips the data
// payload, making the call ~10× faster than fetching the rows themselves.
//
// One handler, five parallel HEAD-style calls — fits in a single dashboard tick.
// Surfaces: My Offers, Open Offers, Team Mate Offers, Assignments, In-progress.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const PROD_BASE = 'https://hypnos.welocalize.tools';

// Each row = { key returned to the caller, Junction endpoint path }.
const TARGETS = [
  { key: 'offers_me',         path: '/v2/offer/me' },
  { key: 'offers_available',  path: '/v2/offer/available' },
  { key: 'offers_rosters',    path: '/v2/offer/rosters' },
  { key: 'tasks_assigned',    path: '/v2/task-list/vendor/assigned' },
  { key: 'tasks_in_progress', path: '/v2/task-list/vendor/me' },
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Admin gate — scheduled/system calls pass through; regular users blocked.
    const user = await base44.auth.me().catch(() => null);
    if (user !== null && user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const jwt = Deno.env.get('JUNCTION_JWT');
    const apiKey = Deno.env.get('JUNCTION_API_KEY');
    if (!jwt) {
      return Response.json({ success: false, error: 'JUNCTION_JWT not configured' }, { status: 503 });
    }

    const headers = { 'x-pantheon-auth': jwt, Accept: 'application/json' };
    if (apiKey) headers['x-api-key'] = apiKey;

    // Fire all five in parallel — Junction's default budget is 500/min, this
    // burst uses 5. Settled, not all-or-nothing: a transient 401 on /me
    // shouldn't poison the other four counts.
    const settled = await Promise.allSettled(
      TARGETS.map(async (t) => {
        const r = await fetch(`${PROD_BASE}${t.path}?%24limit=0`, { headers });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json().catch(() => ({}));
        return data?.meta?.count ?? 0;
      })
    );

    const counts = {};
    const errors = {};
    TARGETS.forEach((t, i) => {
      const s = settled[i];
      if (s.status === 'fulfilled') counts[t.key] = s.value;
      else { counts[t.key] = null; errors[t.key] = s.reason?.message || 'failed'; }
    });

    return Response.json({
      success: true,
      counts,
      ...(Object.keys(errors).length > 0 ? { errors } : {}),
    });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});