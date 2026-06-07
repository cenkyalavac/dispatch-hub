import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ArrowRight, Inbox, AlertCircle, CheckCircle2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { fmtNumber, EM } from '@/lib/format';

// Per-portal pending preview + a tiny health dot inline. One block per active
// connector. Green dot = connected, red = error, grey = not_configured.
// Pending counts come from local sources only (no upstream calls):
//   - GlobalLink: GlobalLinkSubmission rows in status='available'
//   - Others: CachedSnapshot.key = `pending_${portalKey}` written by the
//     portal's fetch_function on its last run.
// This keeps the dashboard cheap to render and respects upstream rate limits.

function pendingHref(portalKey) {
  return `/portals/${portalKey}?tab=pending`;
}

const DOT = {
  connected:      { cls: 'bg-success',  title: 'Connected' },
  error:          { cls: 'bg-danger',   title: 'Connection error' },
  disconnected:   { cls: 'bg-ink-4',    title: 'Disconnected' },
  not_configured: { cls: 'bg-ink-4',    title: 'Not configured' },
};

function PortalBlock({ portal, pending, isLoading }) {
  const dot = DOT[portal.connection_status] || DOT.not_configured;
  const lastSync = portal.last_sync_at ? formatDistanceToNow(new Date(portal.last_sync_at), { addSuffix: true }) : EM;
  const count = pending?.length || 0;
  const top = (pending || []).slice(0, 5);

  // Visual priority: a connection error is the loudest signal (red), a portal
  // with work waiting gets a subtle accent edge, and a quiet/caught-up portal
  // stays neutral. This lets the operator's eye jump straight to trouble.
  const isError = portal.connection_status === 'error';
  const hasWork = count > 0;
  const frame = isError
    ? 'border-danger/40 bg-danger-soft/30'
    : hasWork
      ? 'border-accent/30'
      : 'border-line-1';

  return (
    <div className={`border rounded-md bg-surface-1 transition-colors ${frame}`}>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-line-1">
        <span
          className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot.cls}`}
          title={dot.title}
          aria-label={dot.title}
        />
        <span className="text-[13px] font-semibold text-ink-1 truncate">{portal.name}</span>
        <span className="text-[11px] text-ink-3 tabular-nums">· {fmtNumber(count)} pending</span>
        <span className="ml-auto text-[10px] text-ink-4 italic-editorial">sync {lastSync}</span>
        {count > 5 && (
          <Link
            to={pendingHref(portal.key)}
            className="inline-flex items-center gap-0.5 text-[11px] text-ink-3 hover:text-ink-1 transition-colors duration-tab"
          >
            See {count - 5} more <ArrowRight className="w-3 h-3" />
          </Link>
        )}
      </div>
      {isLoading ? (
        <div className="p-2 space-y-1">{[1, 2].map(i => <Skeleton key={i} className="h-8" />)}</div>
      ) : count === 0 ? (
        <div className="flex items-center justify-center gap-1.5 px-3 py-3 text-[12px] text-ink-3">
          <CheckCircle2 className="w-3.5 h-3.5 text-success" />
          <span className="italic-editorial">All caught up.</span>
        </div>
      ) : (
        <div className="divide-y divide-line-1">
          {top.map((t, i) => (
            <Link
              key={t.id || t.submission_ticket || i}
              to={pendingHref(portal.key)}
              className="flex items-center gap-3 px-3 py-1.5 hover:bg-surface-2 transition-colors duration-tab text-[12px]"
            >
              <span className="font-medium text-ink-1 truncate flex-1">
                {t.submission_name || t.task_name || t.name || EM}
              </span>
              <span className="font-mono text-[11px] text-ink-3 flex-shrink-0">
                {t.source_language || EM}→{t.target_language || EM}
              </span>
              <span className="text-[11px] text-ink-3 tabular-nums flex-shrink-0">{fmtNumber(t.word_count || 0)} w</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ActionNeededPanel({ portals }) {
  const activePortals = useMemo(() => portals.filter(p => p.is_active), [portals]);

  // GlobalLink: read from local entity (always fresh).
  const { data: glPending = [], isLoading: glLoading } = useQuery({
    queryKey: ['action-needed-globallink'],
    queryFn: () => base44.entities.GlobalLinkSubmission.filter({ status: 'available' }, '-created_date', 50),
    staleTime: 30_000,
  });

  // Others: read from CachedSnapshot — never invoke fetch_function here.
  const { data: cachedSnapshots = [], isLoading: snapLoading } = useQuery({
    queryKey: ['action-needed-cached-snapshots'],
    queryFn: () => base44.entities.CachedSnapshot.list('-fetched_at', 50),
    staleTime: 30_000,
  });

  const isLoading = glLoading || snapLoading;

  // Map portal key → pending array.
  const pendingByPortal = useMemo(() => {
    const map = {};
    for (const p of activePortals) {
      if (p.key === 'globallink') {
        map[p.key] = glPending;
      } else {
        const snap = cachedSnapshots.find(s => s.key === `pending_${p.key}`);
        map[p.key] = snap?.data?.tasks || [];
      }
    }
    return map;
  }, [activePortals, glPending, cachedSnapshots]);

  if (activePortals.length === 0) {
    return (
      <section className="bg-surface-1 border border-line-1 rounded-md p-5">
        <h2 className="text-[14px] font-semibold text-ink-1 mb-2">Action needed</h2>
        <div className="flex items-center gap-2 text-[12px] text-ink-3 italic-editorial">
          <AlertCircle className="w-3.5 h-3.5" /> No active connectors. Enable one in Connectors.
        </div>
      </section>
    );
  }

  return (
    <section className="bg-surface-1 border border-line-1 rounded-md p-5">
      <div className="flex items-end justify-between mb-3">
        <div>
          <h2 className="text-[14px] font-semibold text-ink-1">Action needed</h2>
          <p className="text-[12px] text-ink-3 italic-editorial mt-0.5">
            Pending per connector, with health and last sync at a glance.
          </p>
        </div>
      </div>
      <div className="space-y-2.5">
        {activePortals.map(p => (
          <PortalBlock
            key={p.key}
            portal={p}
            pending={pendingByPortal[p.key]}
            isLoading={isLoading}
          />
        ))}
      </div>
    </section>
  );
}