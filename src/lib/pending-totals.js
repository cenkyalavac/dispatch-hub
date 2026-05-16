import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

// Shared accessor for the "how many tasks are waiting across all connectors"
// number. Two consumers today: the dashboard header pill and the
// ActionNeededPanel. Both subscribe to the same React Query keys so the cache
// is shared — no duplicate fetches.
//
// Doctrine reminder: we never call a portal's fetch_function from here. The
// counts come from CachedSnapshot rows (written by each portal's last poll)
// and from the GlobalLinkSubmission entity (status='available').
export function usePendingTotals(portals) {
  const activePortals = useMemo(() => (portals || []).filter(p => p.is_active), [portals]);

  const { data: glPending = [], isLoading: glLoading } = useQuery({
    queryKey: ['action-needed-globallink'],
    queryFn: () => base44.entities.GlobalLinkSubmission.filter({ status: 'available' }, '-created_date', 50),
    staleTime: 30_000,
  });

  const { data: cachedSnapshots = [], isLoading: snapLoading } = useQuery({
    queryKey: ['action-needed-cached-snapshots'],
    queryFn: () => base44.entities.CachedSnapshot.list('-fetched_at', 50),
    staleTime: 30_000,
  });

  const { byPortal, total } = useMemo(() => {
    const byPortal = {};
    for (const p of activePortals) {
      if (p.key === 'globallink') {
        byPortal[p.key] = glPending.length;
      } else {
        const snap = cachedSnapshots.find(s => s.key === `pending_${p.key}`);
        byPortal[p.key] = snap?.data?.tasks?.length || 0;
      }
    }
    const total = Object.values(byPortal).reduce((sum, n) => sum + n, 0);
    return { byPortal, total };
  }, [activePortals, glPending, cachedSnapshots]);

  return {
    total,
    byPortal,
    connectorCount: activePortals.length,
    isLoading: glLoading || snapLoading,
  };
}