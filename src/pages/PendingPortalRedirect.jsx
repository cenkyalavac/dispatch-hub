import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Skeleton } from '@/components/ui/skeleton';

// /pending no longer has a unified "All" view. This route exists only as a
// graceful fallback for bookmarked links: redirect to the first active
// non-globallink portal, or to /globallink/pending if that's the only
// active one. If no portals are active, show a soft message.
export default function PendingPortalRedirect() {
  const navigate = useNavigate();
  const { data: portals = [], isLoading } = useQuery({
    queryKey: ['portals-all'],
    queryFn: () => base44.entities.Portal.list(),
  });

  useEffect(() => {
    if (isLoading) return;
    const active = portals.filter((p) => p.is_active);
    const nonGL = active.find((p) => p.key !== 'globallink');
    if (nonGL) {
      navigate(`/pending/${nonGL.key}`, { replace: true });
      return;
    }
    const gl = active.find((p) => p.key === 'globallink');
    if (gl) navigate('/globallink/pending', { replace: true });
  }, [isLoading, portals, navigate]);

  return (
    <div className="px-8 py-7 max-w-3xl space-y-3">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-4 w-72" />
      <p className="text-[12px] text-ink-3 italic-editorial pt-2">
        Pick a connector from the Pending menu in the top bar.
      </p>
    </div>
  );
}