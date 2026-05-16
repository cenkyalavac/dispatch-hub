// Auto-close open SystemIssues of a given (type, portal) when a subsequent run
// succeeds. Called from inside poll/cron functions on their happy path —
// e.g. globallinkPoll calls this with {type:'poll_failure', portal:'globallink'}
// after a successful poll so any open poll-failure auto-resolves.
//
// Also exposed as a manual resolve endpoint: pass {issue_id, note} to close
// a single issue from the UI.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    // Soft auth: scheduled cron has no user context; UI manual resolve has admin.
    if (user !== null && user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { issue_id, type, portal, note = '' } = body || {};
    const nowIso = new Date().toISOString();
    const resolver = user?.email || 'auto';

    // Single-issue manual close from UI.
    if (issue_id) {
      await base44.asServiceRole.entities.SystemIssue.update(issue_id, {
        resolved_at: nowIso,
        resolved_by: resolver,
        resolution_note: note,
      });
      return Response.json({ ok: true, closed: 1 });
    }

    // Auto-close all open issues matching (type, portal). Used by happy-path
    // hooks in poll/cron functions.
    if (!type) {
      return Response.json({ error: 'issue_id or type is required' }, { status: 400 });
    }
    const open = await base44.asServiceRole.entities.SystemIssue
      .filter({ type, portal: portal || '' }, '-last_seen_at', 50)
      .catch(() => []);
    const toClose = open.filter((i) => !i.resolved_at);
    for (const i of toClose) {
      await base44.asServiceRole.entities.SystemIssue.update(i.id, {
        resolved_at: nowIso,
        resolved_by: resolver,
        resolution_note: note || 'Auto-resolved by subsequent successful run',
      }).catch((e) => console.error('resolveSystemIssues update failed:', e.message));
    }

    return Response.json({ ok: true, closed: toClose.length });
  } catch (error) {
    console.error('resolveSystemIssues error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});