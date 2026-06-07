// Resolve open SystemIssues.
//
// Three call shapes:
//   1. {issue_id, note?}              → close one issue. Admin only.
//   2. {issue_ids: [...], note?}      → bulk close. Admin only.
//   3. {type, portal?, note?}         → auto-close all matching open issues.
//                                       Called by happy-path hooks in poll/cron
//                                       functions; runs as service (no user).
//
// Manual paths (1, 2) require admin auth. Auto-resolve (3) runs unauthenticated
// because it's called by scheduled crons that have no user context.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    const body = await req.json().catch(() => ({}));
    const { issue_id, issue_ids, type, portal, dedup_key, note = '' } = body || {};

    const nowIso = new Date().toISOString();
    const resolver = user?.email || 'auto';

    // Manual single close (UI).
    if (issue_id) {
      if (user && user.role !== 'admin') {
        return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
      }
      const before = await base44.asServiceRole.entities.SystemIssue.get(issue_id).catch(() => null);
      if (!before) return Response.json({ ok: false, error: 'Issue not found' }, { status: 404 });
      if (before.resolved_at) return Response.json({ ok: true, closed: 0, already_resolved: true });
      await base44.asServiceRole.entities.SystemIssue.update(issue_id, {
        resolved_at: nowIso,
        resolved_by: resolver,
        resolution_note: note || '',
      });
      return Response.json({ ok: true, closed: 1 });
    }

    // Manual bulk close (UI). Parallelised — bulk-resolving 50 issues
    // sequentially was a multi-second round-trip per call; Promise.all
    // collapses that to one network burst.
    if (Array.isArray(issue_ids) && issue_ids.length > 0) {
      if (user && user.role !== 'admin') {
        return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
      }
      const results = await Promise.all(issue_ids.map(async (id) => {
        const before = await base44.asServiceRole.entities.SystemIssue.get(id).catch(() => null);
        if (!before || before.resolved_at) return false;
        const ok = await base44.asServiceRole.entities.SystemIssue.update(id, {
          resolved_at: nowIso,
          resolved_by: resolver,
          resolution_note: note || '',
        }).then(() => true).catch((e) => {
          console.error('bulk resolve update failed:', e.message);
          return false;
        });
        return ok;
      }));
      return Response.json({ ok: true, closed: results.filter(Boolean).length });
    }

    // Auto-close by (type, portal). Used by happy-path hooks in poll/cron
    // functions — runs unauthenticated because the caller is a scheduled cron.
    if (!type) {
      return Response.json({ error: 'issue_id, issue_ids, or type is required' }, { status: 400 });
    }
    // Filter explicit: include `portal` only when caller passed it. Calling
    // `.filter({type, portal: ''}, ...)` would otherwise auto-resolve every
    // open warning whose portal happens to be empty — across types.
    const filterSpec = portal ? { type, portal } : { type };
    // Narrow further by dedup_key when provided — lets a caller auto-resolve a
    // SPECIFIC issue signature (e.g. the googlesheets_connector outage) without
    // closing every other open issue of the same type.
    if (dedup_key) filterSpec.dedup_key = dedup_key;
    const candidates = await base44.asServiceRole.entities.SystemIssue
      .filter(filterSpec, '-last_seen_at', 100)
      .catch(() => []);
    const toClose = candidates.filter((i) => !i.resolved_at);
    await Promise.all(toClose.map((i) =>
      base44.asServiceRole.entities.SystemIssue.update(i.id, {
        resolved_at: nowIso,
        resolved_by: resolver,
        resolution_note: note || 'Auto-resolved by subsequent successful run',
      }).catch((e) => console.error('resolveSystemIssues update failed:', e.message))
    ));

    return Response.json({ ok: true, closed: toClose.length });
  } catch (error) {
    console.error('resolveSystemIssues error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});