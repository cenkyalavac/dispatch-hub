import { useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';

import TodayPanel from '@/components/dashboard/TodayPanel';
import ActionNeeded from '@/components/dashboard/ActionNeeded';
import TopBreakdown from '@/components/dashboard/TopBreakdown';
import { Skeleton } from '@/components/ui/skeleton';

// Lightweight overview — 3 focused panels:
//   1. Today: ops-mode counters (accepted / words / rejected / errors)
//   2. Connectors: per-portal health + pending preview (top 5 each)
//   3. Top clients & language pairs (last 30 days)
//
// We pull "pending" lists from local entities only (AcceptedTask for skipped
// rows, GlobalLinkSubmission for available submissions). We deliberately
// don't hit Symfonie/Junction's pending endpoints here — those are rate-
// limited; the dashboard auto-loads and we don't want to burn quota every
// page-view. The detail pages (/pending/:portal) fetch live data on demand.

export default function Dashboard() {
  const { data: portals = [], isLoading: portalsLoading } = useQuery({
    queryKey: ['portals-all'],
    queryFn: () => base44.entities.Portal.list(),
  });
  const { data: allTasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: ['accepted-tasks-recent'],
    queryFn: () => base44.entities.AcceptedTask.list('-accepted_at', 1000),
  });
  // GlobalLink pending lives in its own entity. Symfonie/Junction skipped
  // rows live in AcceptedTask with status='skipped' (or 'error').
  const { data: glPending = [] } = useQuery({
    queryKey: ['globallink-pending-overview'],
    queryFn: () => base44.entities.GlobalLinkSubmission.filter({ status: 'available' }, '-created_date', 50),
  });

  // Per-portal pending buckets for the Action Needed card.
  //  - Symfonie / Junction: AcceptedTask rows that landed with status='skipped'
  //    (a process run that found no matching rule) — those are the ones a
  //    human still needs to decide on.
  //  - GlobalLink: the entity-backed available submission list.
  const portalBuckets = useMemo(() => {
    const skippedByPortal = {};
    for (const t of allTasks) {
      if (t.status !== 'skipped') continue;
      if (!skippedByPortal[t.portal]) skippedByPortal[t.portal] = [];
      skippedByPortal[t.portal].push(t);
    }
    return portals.map((p) => {
      if (p.key === 'globallink') {
        return { portal: p, items: glPending, total: glPending.length };
      }
      const items = skippedByPortal[p.key] || [];
      return { portal: p, items, total: items.length };
    });
  }, [portals, allTasks, glPending]);

  const loading = portalsLoading || tasksLoading;

  return (
    <div className="px-8 py-7 max-w-6xl">
      <header className="mb-7">
        <h1 className="text-[22px] font-semibold tracking-tight text-ink-1">Overview</h1>
        <p className="text-[13px] text-ink-3 mt-1 italic-editorial">
          Today’s pulse, what needs you, and where the work is coming from.
        </p>
      </header>

      {loading ? (
        <>
          <Skeleton className="h-24 mb-7" />
          <Skeleton className="h-40 mb-7" />
          <Skeleton className="h-40 mb-7" />
        </>
      ) : (
        <>
          <TodayPanel tasks={allTasks} />
          <ActionNeeded portalBuckets={portalBuckets} />
          <TopBreakdown tasks={allTasks} />
        </>
      )}
    </div>
  );
}