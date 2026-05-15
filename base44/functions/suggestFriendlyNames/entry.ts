// Surfaces upstream values seen in real tasks that don't yet have a
// FriendlyName rumuz. Reads from AcceptedTask + GlobalLinkSubmission and
// groups distinct values per (portal, type) pair. Returns top-50 ranked by
// frequency.
//
// No writes. Pure read endpoint; the frontend posts one suggestion at a time
// to FriendlyName.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Which task fields supply candidate values per friendly type. Kept in sync
// with FRIENDLY_FIELDS in lib/friendly.js — the resolver and the suggester
// must look at the same fields.
const FIELD_SOURCES = [
  { type: 'client',   taskField: 'client_name' },
  { type: 'account',  taskField: 'account_name' },
  { type: 'project',  taskField: 'project_name' },
  { type: 'workflow', taskField: 'workflow_name' },
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // 1. Existing friendly names → covered set keyed by (portal|type|value-lc).
    const existing = await base44.asServiceRole.entities.FriendlyName.list('-created_date', 2000);
    const covered = new Set();
    for (const e of existing) {
      if (e.match_by && e.match_by !== 'name') continue; // only name-matched suggestions
      const portals = e.portal === '*' ? ['*'] : [e.portal];
      for (const p of portals) {
        covered.add(`${p}|${e.type}|${String(e.source_value || '').toLowerCase()}`);
      }
    }

    // 2. Sweep recent task rows.
    //   - AcceptedTask has the canonical post-accept shape (client, project, workflow names + account_name).
    //   - GlobalLinkSubmission contributes pre-claim candidates (covers GL workflow/project early).
    const [tasks, submissions] = await Promise.all([
      base44.asServiceRole.entities.AcceptedTask.list('-created_date', 1000).catch(() => []),
      base44.asServiceRole.entities.GlobalLinkSubmission.list('-created_date', 500).catch(() => []),
    ]);

    const counter = new Map(); // dedupeKey -> { portal, type, value, count }

    const ingest = (row, portalFallback) => {
      const portalKey = row.portal || portalFallback || '*';
      for (const { type, taskField } of FIELD_SOURCES) {
        const raw = row[taskField];
        if (!raw || typeof raw !== 'string') continue;
        const value = raw.trim();
        if (!value) continue;
        const valLc = value.toLowerCase();
        // Skip if either the portal-specific or the wildcard rumuz exists.
        const dedupeKey = `${portalKey}|${type}|${valLc}`;
        if (covered.has(dedupeKey)) continue;
        if (covered.has(`*|${type}|${valLc}`)) continue;
        const hit = counter.get(dedupeKey);
        if (hit) hit.count++;
        else counter.set(dedupeKey, { portal: portalKey, type, value, count: 1 });
      }
    };

    for (const t of tasks) ingest(t);
    for (const s of submissions) ingest(s, 'globallink');

    const suggestions = [...counter.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 50);

    return Response.json({
      success: true,
      scanned_tasks: tasks.length,
      scanned_submissions: submissions.length,
      existing_friendly_names: existing.length,
      suggestions,
    });
  } catch (error) {
    console.error('suggestFriendlyNames error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});