import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Inbox, RefreshCw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { EM, fmtNumber } from '@/lib/format';
import PendingTaskRow from './PendingTaskRow';
import SymfonieTaskDetail from '@/components/pending/SymfonieTaskDetail';
import JunctionTaskDetailPanel from '@/components/pending/JunctionTaskDetailPanel';

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

// Minimal row for GlobalLink (its data shape is much narrower than the
// Symfonie/Junction live fetch — single locale, fewer fields).
function GLRow({ task }) {
  const name = task.submission_name || task.task_name || EM;
  const src = task.source_language || EM;
  const tgt = task.target_language || EM;
  const wc = task.word_count || 0;
  const stamp = task.created_date;
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2 transition-colors duration-tab">
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-medium text-ink-1 truncate">{name}</p>
        <p className="text-[11px] text-ink-3 truncate">
          <span className="font-mono">{src} → {tgt}</span>
          {task.project_name && <span> · {task.project_name}</span>}
          {task.client_name && <span className="text-ink-4"> · {task.client_name}</span>}
        </p>
      </div>
      <span className="text-[11px] text-ink-3 tabular-nums flex-shrink-0">{fmtNumber(wc)} w</span>
      <span className="text-[11px] text-ink-4 flex-shrink-0 w-24 text-right">
        {stamp ? formatDistanceToNow(new Date(stamp), { addSuffix: true }) : EM}
      </span>
    </div>
  );
}

// Header is always rendered so Refresh is reachable even while loading —
// previously the Refresh button only appeared after the first successful fetch,
// which is exactly the case where users most want to retry.
function Body({ items, portal, isLoading, refetch, isFetching, errorMsg, RowComponent, onAccept, acceptingId, DetailComponent }) {
  return (
    <section className="bg-surface-1 border border-line-1 rounded-md">
      <header className="flex items-center justify-between px-4 py-2.5 border-b border-line-1">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-ink-1">Pending</span>
          {isLoading ? (
            <Skeleton className="h-3 w-6" />
          ) : (
            <span className="text-[11px] text-ink-3 tabular-nums">{items.length}</span>
          )}
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="inline-flex items-center gap-1 h-7 px-2 rounded text-[11px] text-ink-3 hover:bg-surface-2 hover:text-ink-1 transition-colors duration-tab disabled:opacity-40"
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
              DetailComponent={DetailComponent}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function GlobalLinkPending({ portal }) {
  const { data: rows = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['portal-pending', portal.key],
    queryFn: () =>
      base44.entities.GlobalLinkSubmission.filter({ status: 'available' }, '-created_date', 100),
  });
  return (
    <Body items={rows} portal={portal} isLoading={isLoading} refetch={refetch} isFetching={isFetching} RowComponent={GLRow} />
  );
}

function FetchFnPending({ portal }) {
  const qc = useQueryClient();
  const [acceptingId, setAcceptingId] = useState(null);

  const { data, isLoading, refetch, isFetching, isError, error } = useQuery({
    queryKey: ['portal-pending', portal.key],
    queryFn: async () => {
      const res = await base44.functions.invoke(portal.fetch_function, {});
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
  const items = data?.tasks || [];

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
          // Optimistically drop the row from the cached list.
          qc.setQueryData(['portal-pending', portal.key], (old) => {
            if (!old?.tasks) return old;
            return { ...old, tasks: old.tasks.filter((t) => t.id !== task.id) };
          });
          // Plus invalidate history/recent so other panels reflect it.
          qc.invalidateQueries({ queryKey: ['recent-accepted'] });
        } catch (e) {
          toast.error(e.message || 'Accept failed');
        } finally {
          setAcceptingId(null);
        }
      }
    : null;

  return (
    <Body
      items={items}
      portal={portal}
      isLoading={isLoading}
      refetch={refetch}
      isFetching={isFetching}
      errorMsg={isError ? (error?.message || 'Failed to load') : null}
      RowComponent={PendingTaskRow}
      onAccept={handleAccept}
      acceptingId={acceptingId}
      DetailComponent={DETAIL_BY_PORTAL[portal.key]}
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