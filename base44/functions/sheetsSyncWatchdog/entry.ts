// Sheets sync watchdog — the safety net that was missing during the 12-day
// silent outage. Two jobs, every 15 minutes:
//
//   1. RETRY: re-trigger sheetsSyncPending so any task left at
//      sheets_synced=false gets another append attempt. The accept paths fire
//      sheetsSyncPending too, but ONLY at accept time — if that single attempt
//      fails (connector down, transient Sheets 5xx), nothing else retries it.
//      This cron closes that gap.
//
//   2. STALE ALARM: if any accepted task has been sitting at sheets_synced=false
//      for longer than STALE_MINUTES, raise a deduped SystemIssue. That's the
//      tripwire that would have caught the outage on day one instead of day 12.
//
// sheetsSyncPending itself already raises a connector-down issue; this watchdog
// is the broader "rows are piling up for ANY reason" detector.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const STALE_MINUTES = 30; // older than this at sheets_synced=false ⇒ alarm

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

    // 1. RETRY — fire the sync. sheetsSyncPending is idempotent (claim + dedup),
    //    so a redundant run when there's nothing pending just returns early.
    let syncResult = null;
    try {
      const res = await base44.functions.invoke('sheetsSyncPending', {});
      syncResult = res?.data || null;
    } catch (e) {
      console.error('watchdog: sheetsSyncPending invoke failed:', e.message);
    }

    // 2. STALE ALARM — scan unsynced accepted tasks, find the oldest.
    const pending = await base44.asServiceRole.entities.AcceptedTask
      .filter({ sheets_synced: false, status: 'accepted' }, 'created_date', 500)
      .catch(() => []);

    const cutoffMs = Date.now() - STALE_MINUTES * 60_000;
    const stale = pending.filter((t) => {
      const ts = t.created_date ? new Date(t.created_date).getTime() : Date.now();
      return ts < cutoffMs;
    });

    // Write the SystemIssue DIRECTLY via asServiceRole.entities instead of
    // invoking recordSystemIssue. Nested functions.invoke() can 403 depending
    // on the caller's context (observed in the platform's invoke layer), and
    // this alarm is the whole point of the watchdog — it must not depend on a
    // fragile cross-function call. We replicate recordSystemIssue's dedup
    // (one open issue per signature) inline.
    const nowIso = new Date().toISOString();
    const openBacklog = (await base44.asServiceRole.entities.SystemIssue
      .filter({ type: 'cron_failure', dedup_key: 'sheets_backlog' }, '-last_seen_at', 10)
      .catch(() => []))
      .find((i) => !i.resolved_at) || null;

    if (stale.length > 0) {
      const oldest = stale[0];
      const oldestAgeMin = Math.round((Date.now() - new Date(oldest.created_date).getTime()) / 60_000);
      const title = `${stale.length} task${stale.length === 1 ? '' : 's'} stuck unsynced to Google Sheets`;
      const description = `${stale.length} accepted task(s) have been waiting longer than ${STALE_MINUTES} min to sync to Google Sheets. Oldest: ${oldest.portal} #${oldest.task_id} "${oldest.task_name || ''}" — ${oldestAgeMin} min old.\n\nLikely causes: Google Sheets connector dropped, a SheetRoute points at a deleted spreadsheet, or repeated Sheets API errors. Check the Google Sheets connection and the portal's sheet config.`;
      if (openBacklog) {
        await base44.asServiceRole.entities.SystemIssue.update(openBacklog.id, {
          occurrence_count: (openBacklog.occurrence_count || 1) + 1,
          last_seen_at: nowIso,
          title,
          description,
        }).catch((e) => console.error('SystemIssue bump failed:', e.message));
      } else {
        await base44.asServiceRole.entities.SystemIssue.create({
          type: 'cron_failure',
          severity: 'critical',
          title,
          description,
          portal: '',
          function_name: 'sheetsSyncWatchdog',
          dedup_key: 'sheets_backlog',
          occurrence_count: 1,
          first_seen_at: nowIso,
          last_seen_at: nowIso,
        }).catch((e) => console.error('SystemIssue create failed:', e.message));
      }
    } else if (openBacklog) {
      // No backlog ⇒ auto-resolve the open backlog alarm directly.
      await base44.asServiceRole.entities.SystemIssue.update(openBacklog.id, {
        resolved_at: nowIso,
        resolved_by: 'auto',
        resolution_note: 'Backlog cleared — watchdog confirmed no stale unsynced tasks.',
      }).catch((e) => console.error('SystemIssue resolve failed:', e.message));
    }

    return Response.json({
      ok: true,
      sync: syncResult,
      pending_total: pending.length,
      stale_count: stale.length,
      stale_threshold_min: STALE_MINUTES,
    });
  } catch (error) {
    console.error('sheetsSyncWatchdog error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});