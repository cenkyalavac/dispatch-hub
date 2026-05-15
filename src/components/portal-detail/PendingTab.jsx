import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Inbox, RefreshCw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/ui/EmptyState';
import { EM, fmtNumber } from '@/lib/format';

// Per-portal pending preview inside PortalDetail. Acts as a shortcut to the
// portal's dedicated /pending page. Uses local entity data only (no rate-
// limited upstream calls), so it's safe to render on every detail load.
//   - GlobalLink: GlobalLinkSubmission rows in status='available'
//   - Symfonie / Junction: cached pending snapshot via the portal's fetch_function
//
// For the Symfonie/Junction branch we deliberately reuse the CachedSnapshot
// the live page already populated — calling the fetch_function here would
// double the API hits.

function pendingHref(portalKey) {
  return portalKey === 'globallink' ? '/globallink/pending' : `/pending/${portalKey}`;
}

function Row({ task, portalKey }) {
  // GlobalLinkSubmission fields differ from AcceptedTask/Symfonie pending —
  // normalise just enough to show one consistent row.
  const name = task.submission_name || task.task_name || task.name || EM;
  const src = task.source_language || EM;
  const tgt = task.target_language || EM;
  const wc = task.word_count || 0;
  const stamp = task.created_date || task.created_at;
  return (
    <Link
      to={pendingHref(portalKey)}
      className="flex items-center gap-3 px-3 py-2 hover:bg-surface-2 transition-colors duration-tab"
    >
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-medium text-ink-1 truncate">{name}</p>
        <p className="text-[11px] text-ink-3 truncate font-mono">
          {src} → {tgt}
          {task.project_name && <span className="font-sans"> · {task.project_name}</span>}
        </p>
      </div>
      <span className="text-[11px] text-ink-3 tabular-nums flex-shrink-0">{fmtNumber(wc)} w</span>
      <span className="text-[11px] text-ink-4 flex-shrink-0 w-24 text-right">
        {stamp ? formatDistanceToNow(new Date(stamp), { addSuffix: true }) : EM}
      </span>
    </Link>
  );
}

function GlobalLinkPending({ portal }) {
  const { data: rows = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['portal-pending', portal.key],
    queryFn: () => base44.entities.GlobalLinkSubmission.filter({ status: 'available' }, '-created_date', 100),
  });
  return (
    <Body items={rows} portal={portal} isLoading={isLoading} refetch={refetch} isFetching={isFetching} />
  );
}

function FetchFnPending({ portal }) {
  // Symfonie / Junction: call the portal's fetch_function. The backend caches
  // for 5 minutes via CachedSnapshot, so opening the tab repeatedly doesn't
  // re-hit upstream.
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
  return (
    <Body
      items={items}
      portal={portal}
      isLoading={isLoading}
      refetch={refetch}
      isFetching={isFetching}
      errorMsg={isError ? (error?.message || 'Failed to load') : null}
    />
  );
}

function Body({ items, portal, isLoading, refetch, isFetching, errorMsg }) {
  if (isLoading) {
    return <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12" />)}</div>;
  }
  return (
    <section className="bg-surface-1 border border-line-1 rounded-md">
      <header className="flex items-center justify-between px-4 py-2.5 border-b border-line-1">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-ink-1">Pending</span>
          <span className="text-[11px] text-ink-3 tabular-nums">{items.length}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-1 h-7 px-2 rounded text-[11px] text-ink-3 hover:bg-surface-2 hover:text-ink-1 transition-colors duration-tab disabled:opacity-40"
          >
            <RefreshCw className={`w-3 h-3 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <Link
            to={pendingHref(portal.key)}
            className="inline-flex items-center gap-1 h-7 px-2 rounded text-[11px] text-ink-3 hover:bg-surface-2 hover:text-ink-1 transition-colors duration-tab"
          >
            Open full list <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </header>
      {errorMsg ? (
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
          {items.slice(0, 25).map((it) => (
            <Row key={it.id} task={it} portalKey={portal.key} />
          ))}
        </div>
      )}
    </section>
  );
}

export default function PendingTab({ portal }) {
  if (portal.key === 'globallink') return <GlobalLinkPending portal={portal} />;
  if (!portal.fetch_function) {
    return (
      <EmptyState
        title="No fetch function"
        body={`${portal.name} has no fetch_function configured — pending tasks can't be fetched on demand.`}
      />
    );
  }
  return <FetchFnPending portal={portal} />;
}