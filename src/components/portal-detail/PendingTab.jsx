import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Inbox, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import PendingTaskRow from './PendingTaskRow';
import SymfonieTaskDetail from '@/components/pending/SymfonieTaskDetail';
import JunctionTaskDetailPanel from '@/components/pending/JunctionTaskDetailPanel';
import JunctionOfferTypeSwitch from './JunctionOfferTypeSwitch';
import SubmissionTableRow from '@/components/globallink/SubmissionTableRow';

// Snapshot key per portal. Only portals whose fetch function writes a
// CachedSnapshot row will have a fast-path render — everything else falls
// back to the live fetch with no placeholder.
const SNAPSHOT_KEY_BY_PORTAL = {
  symfonie: 'pending_symfonie',
};

// Per-portal detail component map. Each connector is fully isolated — adding a
// new portal means adding one entry here, no cross-imports inside detail files.
const DETAIL_BY_PORTAL = {
  symfonie: SymfonieTaskDetail,
  junction: JunctionTaskDetailPanel,
};

// Per-portal pending list inside PortalDetail. This IS the pending list now —
// no separate /pending/:key page to bounce to.
//   - GlobalLink: GlobalLinkSubmission rows in status='available' (local entity).
//   - Symfonie / Junction: live via the portal's fetch_function, cached 5min
//     server-side via CachedSnapshot so repeated tab opens are cheap.

// GlobalLink rows are richer than Symfonie/Junction — 8 leverage bands + WWC
// + TR deadline — so they render in a full table via SubmissionTableRow
// rather than the generic list row used by other portals.

// Header is always rendered so Refresh is reachable even while loading —
// previously the Refresh button only appeared after the first successful fetch,
// which is exactly the case where users most want to retry.
function Body({ items, portal, isLoading, refetch, isFetching, errorMsg, RowComponent, onAccept, acceptingId, onReject, rejectingId, DetailComponent, snapshotAge, headerExtra }) {
  return (
    <section className="bg-surface-1 border border-line-1 rounded-md">
      <header className="flex items-center justify-between px-4 py-2.5 border-b border-line-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[13px] font-semibold text-ink-1">Pending</span>
          {isLoading ? (
            <Skeleton className="h-3 w-6" />
          ) : (
            <span className="text-[11px] text-ink-3 tabular-nums">{items.length}</span>
          )}
          {/* Cache age hint — only shown when we're showing snapshot data while
              a fresh fetch is in flight, so the user knows the list might be
              slightly stale and that "live" data is on its way. */}
          {snapshotAge && isFetching && (
            <span className="text-[11px] text-ink-4 italic-editorial">· cached {snapshotAge}</span>
          )}
          {/* Portal-specific header content (e.g. Junction's offer-type switch). */}
          {headerExtra && <div className="ml-2">{headerExtra}</div>}
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="inline-flex items-center gap-1 h-7 px-2 rounded text-[11px] text-ink-3 hover:bg-surface-2 hover:text-ink-1 transition-colors duration-tab disabled:cursor-wait"
        >
          <RefreshCw className={`w-3 h-3 ${isFetching ? 'animate-spin' : ''}`} />
          {isFetching ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>
      {isLoading ? (
        <div className="divide-y divide-line-1">
          {[1, 2, 3].map((i) => (
            <div key={i} className="px-4 py-3 space-y-2">
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="h-2.5 w-1/2" />
            </div>
          ))}
        </div>
      ) : errorMsg ? (
        <div className="px-4 py-5 text-center">
          <p className="text-[12px] text-danger">{errorMsg}</p>
        </div>
      ) : items.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <Inbox className="w-5 h-5 mx-auto text-ink-4 mb-2" />
          <p className="text-[12px] text-ink-3 italic-editorial">Nothing waiting on this connector.</p>
        </div>
      ) : (
        <div className="divide-y divide-line-1">
          {items.map((it) => (
            <RowComponent
              key={it.id}
              task={it}
              portalKey={portal.key}
              onAccept={onAccept}
              isAccepting={onAccept && acceptingId === it.id}
              onReject={onReject}
              isRejecting={onReject && rejectingId === it.id}
              DetailComponent={DetailComponent}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function GlobalLinkPending({ portal }) {
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState(null);
  const [busyAction, setBusyAction] = useState(null);

  const { data: rows = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['portal-pending', portal.key],
    queryFn: () =>
      base44.entities.GlobalLinkSubmission.filter({ status: 'available' }, '-created_date', 100),
  });

  const dropRow = (id) => {
    qc.setQueryData(['portal-pending', portal.key], (old = []) => old.filter((r) => r.id !== id));
    qc.invalidateQueries({ queryKey: ['recent-accepted'] });
  };

  const onApprove = async (row) => {
    setBusyId(row.id); setBusyAction('approve');
    try {
      const res = await base44.functions.invoke('globallinkApproveOne', {
        submission_row_id: row.id,
        submission_ticket: row.submission_ticket,
      });
      const data = res.data || {};
      if (data.success === false || data.error) throw new Error(data.error || 'Claim failed');
      const langs = (data.claimed_languages || []).join(', ');
      toast.success(`Claimed ${row.submission_id || row.submission_ticket}${langs ? ` (${langs})` : ''}`);
      dropRow(row.id);
    } catch (e) {
      toast.error(e.message || 'Claim failed');
    } finally {
      setBusyId(null); setBusyAction(null);
    }
  };

  const onSkip = async (row) => {
    if (!confirm(`Skip submission ${row.submission_id || row.submission_ticket}? It will be hidden from this list.`)) return;
    setBusyId(row.id); setBusyAction('skip');
    try {
      await base44.entities.GlobalLinkSubmission.update(row.id, {
        status: 'skipped',
        claim_error: 'Skipped manually',
      });
      toast.success('Skipped');
      dropRow(row.id);
    } catch (e) {
      toast.error(e.message || 'Skip failed');
    } finally {
      setBusyId(null); setBusyAction(null);
    }
  };

  return (
    <section className="bg-surface-1 border border-line-1 rounded-md">
      <header className="flex items-center justify-between px-4 py-2.5 border-b border-line-1">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-ink-1">Pending</span>
          {isLoading ? (
            <Skeleton className="h-3 w-6" />
          ) : (
            <span className="text-[11px] text-ink-3 tabular-nums">{rows.length}</span>
          )}
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="inline-flex items-center gap-1 h-7 px-2 rounded text-[11px] text-ink-3 hover:bg-surface-2 hover:text-ink-1 transition-colors duration-tab disabled:cursor-wait"
        >
          <RefreshCw className={`w-3 h-3 ${isFetching ? 'animate-spin' : ''}`} />
          {isFetching ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>
      {isLoading ? (
        <div className="p-4 space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-7" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <Inbox className="w-5 h-5 mx-auto text-ink-4 mb-2" />
          <p className="text-[12px] text-ink-3 italic-editorial">No available submissions.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead className="bg-surface-2 text-[10px] uppercase tracking-wider text-ink-3">
              <tr>
                <th className="px-2 py-2 text-left font-medium">Client</th>
                <th className="px-2 py-2 text-left font-medium">ID</th>
                <th className="px-2 py-2 text-left font-medium">Submission</th>
                <th className="px-2 py-2 text-left font-medium">Target</th>
                <th className="px-2 py-2 text-right font-medium">Ctx</th>
                <th className="px-2 py-2 text-right font-medium">100%</th>
                <th className="px-2 py-2 text-right font-medium">Rep</th>
                <th className="px-2 py-2 text-right font-medium">95-99</th>
                <th className="px-2 py-2 text-right font-medium">85-94</th>
                <th className="px-2 py-2 text-right font-medium">75-84</th>
                <th className="px-2 py-2 text-right font-medium">50-74</th>
                <th className="px-2 py-2 text-right font-medium">NoMatch</th>
                <th className="px-2 py-2 text-right font-medium">Total</th>
                <th className="px-2 py-2 text-right font-medium">WWC</th>
                <th className="px-2 py-2 text-left font-medium">Deadline</th>
                <th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <SubmissionTableRow
                  key={r.id}
                  row={r}
                  onApprove={onApprove}
                  onSkip={onSkip}
                  busyAction={busyId === r.id ? busyAction : null}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function FetchFnPending({ portal }) {
  const qc = useQueryClient();
  const [acceptingId, setAcceptingId] = useState(null);
  const [rejectingId, setRejectingId] = useState(null);
  // Junction has three offer surfaces (me/available/rosters). For other portals
  // this state is set once and ignored — the fetch payload doesn't include it.
  const isJunction = portal.key === 'junction';
  const [offerType, setOfferType] = useState('me');

  // Snapshot fast-path: when the portal writes a CachedSnapshot row from its
  // fetch function (currently only Symfonie), read it as `placeholderData`
  // so the list renders instantly on first paint. The live fetch still runs
  // in the background and overwrites the placeholder once it resolves.
  const snapshotKey = SNAPSHOT_KEY_BY_PORTAL[portal.key];
  const { data: snapshot } = useQuery({
    queryKey: ['portal-pending-snapshot', portal.key],
    queryFn: async () => {
      const rows = await base44.entities.CachedSnapshot.filter({ key: snapshotKey }, '-created_date', 1);
      return rows[0] || null;
    },
    enabled: !!snapshotKey,
    staleTime: Infinity, // snapshot itself is read once per mount
  });

  // Junction-only: pull the 3 KPI counts in parallel via $limit=0 so the
  // segment switch shows "Open 1" etc. without paying for the full payload.
  // Other portals skip this query entirely.
  const { data: junctionCounts } = useQuery({
    queryKey: ['junction-counts'],
    queryFn: async () => {
      const res = await base44.functions.invoke('junctionGetCounts', {});
      return res.data?.counts || {};
    },
    enabled: isJunction,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const { data, isLoading, refetch, isFetching, isError, error } = useQuery({
    // Segment selection is part of the cache key so switching tabs flips
    // cleanly between the three Junction offer surfaces.
    queryKey: ['portal-pending', portal.key, isJunction ? offerType : null],
    queryFn: async () => {
      const payload = isJunction ? { offer_type: offerType } : {};
      const res = await base44.functions.invoke(portal.fetch_function, payload);
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
    staleTime: 5 * 60_000,
    retry: false,
    // Use the snapshot as initial data so the table is filled on first render
    // even while the live fetch is still in flight.
    placeholderData: snapshot?.data || undefined,
  });
  const items = data?.tasks || [];

  // Format the snapshot's age compactly ("12m", "2h") for the header hint.
  const snapshotAge = (() => {
    if (!snapshot?.fetched_at) return null;
    const ms = Date.now() - new Date(snapshot.fetched_at).getTime();
    const m = Math.round(ms / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.round(m / 60);
    return `${h}h ago`;
  })();

  // Shared optimistic-remove helper — every action (accept/reject) drops the
  // row from the active list and invalidates downstream counters. Guards
  // against null taskId: filtering by `t.id !== null` would otherwise wipe
  // every row whose id is also null (the whole list).
  const dropRowFromCache = (taskId) => {
    if (taskId == null) return;
    const listKey = ['portal-pending', portal.key, isJunction ? offerType : null];
    qc.setQueryData(listKey, (old) => {
      if (!old?.tasks) return old;
      return { ...old, tasks: old.tasks.filter((t) => t.id !== taskId) };
    });
    if (isJunction) qc.invalidateQueries({ queryKey: ['junction-counts'] });
    qc.invalidateQueries({ queryKey: ['recent-accepted'] });
  };

  // Accept handler is wired only when the portal declares an accept_function.
  // Each portal's accept fn has its own payload contract — we just pass through
  // the canonical fields the row already has. Optimistic remove on success so
  // the list updates immediately without waiting for the next poll.
  const handleAccept = portal.accept_function
    ? async (task) => {
        setAcceptingId(task.id);
        try {
          const res = await base44.functions.invoke(portal.accept_function, {
            task_id: task.id,
            task_name: task.name || task.task_name || '',
            project_name: task.project_name || '',
            account_name: task.account_name || task.client_name || '',
            client_name: task.client_name || task.account_name || '',
            source_language: task.source_language || '',
            target_language: task.target_language || '',
            word_count: task.word_count || 0,
            price: task.price ?? task.price_max_usd ?? 0,
            due_date: task.due_date || null,
            // Junction-specific extras — Symfonie accept ignores unknown keys,
            // so it's safe to forward them unconditionally.
            workflow_name: task.workflow_name || '',
          });
          const payload = res.data || {};
          if (payload.error || payload.success === false) {
            throw new Error(payload.error || 'Accept failed');
          }
          toast.success(`Accepted: ${task.name || task.task_name || task.project_name || `#${task.id}`}`);
          // Symfonie returns handoff status — surface a soft warning if the
          // Dropbox download failed (accept itself still succeeded).
          if (payload.handoff?.error) {
            toast.warning('Handoff to Dropbox failed — accept succeeded but files were not downloaded.');
          }
          dropRowFromCache(task.id);
        } catch (e) {
          toast.error(e.message || 'Accept failed');
        } finally {
          setAcceptingId(null);
        }
      }
    : null;

  // Reject handler — wired only when the portal declares a reject_function.
  // Same shape as Accept but calls the per-portal reject endpoint. Junction
  // rejects need a category; we default to "capacity" which the API accepts
  // without an explanation note.
  const handleReject = portal.reject_function
    ? async (task) => {
        if (!confirm(`Reject "${task.name || task.task_name || `#${task.id}`}"?`)) return;
        setRejectingId(task.id);
        try {
          const res = await base44.functions.invoke(portal.reject_function, {
            task_id: task.id,
            task_name: task.name || task.task_name || '',
            project_name: task.project_name || '',
            account_name: task.account_name || task.client_name || '',
            client_name: task.client_name || task.account_name || '',
            source_language: task.source_language || '',
            target_language: task.target_language || '',
            word_count: task.word_count || 0,
            price: task.price ?? task.price_max_usd ?? 0,
            due_date: task.due_date || null,
            workflow_name: task.workflow_name || '',
            reason_category: 'capacity',
          });
          const payload = res.data || {};
          if (payload.error || payload.success === false) {
            throw new Error(payload.error || 'Reject failed');
          }
          toast.success(`Rejected: ${task.name || task.task_name || `#${task.id}`}`);
          dropRowFromCache(task.id);
        } catch (e) {
          toast.error(e.message || 'Reject failed');
        } finally {
          setRejectingId(null);
        }
      }
    : null;

  return (
    <Body
      items={items}
      portal={portal}
      // When the snapshot serves the first paint, suppress the skeleton —
      // we already have rows to show; the spinner on Refresh signals
      // background work.
      isLoading={isLoading && items.length === 0}
      refetch={refetch}
      isFetching={isFetching}
      errorMsg={isError ? (error?.message || 'Failed to load') : null}
      RowComponent={PendingTaskRow}
      onAccept={handleAccept}
      acceptingId={acceptingId}
      onReject={handleReject}
      rejectingId={rejectingId}
      DetailComponent={DETAIL_BY_PORTAL[portal.key]}
      snapshotAge={snapshotAge}
      headerExtra={isJunction ? (
        <JunctionOfferTypeSwitch
          value={offerType}
          onChange={setOfferType}
          counts={{
            me: junctionCounts?.offers_me,
            available: junctionCounts?.offers_available,
            rosters: junctionCounts?.offers_rosters,
          }}
        />
      ) : null}
    />
  );
}

export default function PendingTab({ portal }) {
  if (portal.key === 'globallink') return <GlobalLinkPending portal={portal} />;
  if (!portal.fetch_function) {
    return (
      <div className="bg-surface-1 border border-dashed border-line-2 rounded-md px-6 py-10 text-center">
        <p className="text-[13px] text-ink-3 italic-editorial">
          {portal.name} has no fetch_function configured — pending tasks can't be fetched on demand.
        </p>
      </div>
    );
  }
  return <FetchFnPending portal={portal} />;
}