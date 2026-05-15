import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';

// Legacy /pending URL (no portal selected). Send the user straight to the
// first active portal's pending page so the route is never "empty".
export default function PendingPortalRedirect() {
  const navigate = useNavigate();
  const { data: portals = [], isLoading } = useQuery({
    queryKey: ['portals-all'],
    queryFn: () => base44.entities.Portal.list(),
  });

  useEffect(() => {
    if (isLoading) return;
    // Prefer an active portal with a fetch_function; GlobalLink has its own
    // route, so prefer Symfonie/Junction here and only fall back to GlobalLink.
    const candidate =
      portals.find(p => p.is_active && p.fetch_function) ||
      portals.find(p => p.is_active);
    if (!candidate) {
      navigate('/portals', { replace: true });
      return;
    }
    if (candidate.key === 'globallink') {
      navigate('/globallink/pending', { replace: true });
    } else {
      navigate(`/pending/${candidate.key}`, { replace: true });
    }
  }, [isLoading, portals, navigate]);

  return (
    <div className="px-8 py-7 max-w-6xl">
      <Skeleton className="h-6 w-32 mb-4" />
      <Skeleton className="h-24" />
    </div>
  );
}