import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, XCircle, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/ui/EmptyState';
import { EM } from '@/lib/format';

export default function ActivityTab({ portal }) {
  const { data: accepted = [], isLoading: loadingAccepted } = useQuery({
    queryKey: ['portal-activity-accepted', portal.key],
    queryFn: () => base44.entities.AcceptedTask.filter({ portal: portal.key }, '-created_date', 50),
  });

  const { data: pendingGL = [], isLoading: loadingPending } = useQuery({
    queryKey: ['portal-activity-pending', portal.key],
    queryFn: () =>
      portal.key === 'globallink'
        ? base44.entities.GlobalLinkSubmission.filter({ status: 'available' }, '-created_date', 50)
        : Promise.resolve([]),
    enabled: portal.key === 'globallink',
  });

  const isLoading = loadingAccepted || (portal.key === 'globallink' && loadingPending);

  if (isLoading) {
    return <div className="space-y-2">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-14" />)}</div>;
  }

  return (
    <div className="space-y-6">
      {portal.key === 'globallink' && (
        <section>
          <h3 className="text-[13px] font-semibold text-ink-1 mb-2 inline-flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-ink-3" /> Pending submissions
            <span className="text-[10px] tabular-nums text-ink-4">{pendingGL.length}</span>
          </h3>
          {pendingGL.length === 0 ? (
            <EmptyState title="Nothing pending" body="No available submissions right now." />
          ) : (
            <div className="space-y-1.5">
              {pendingGL.slice(0, 20).map((s) => (
                <div key={s.id} className="bg-surface-1 border border-line-1 rounded-md px-3 py-2 flex items-center gap-3 text-[12px]">
                  <span className="font-medium text-ink-1 truncate flex-1">{s.submission_name || EM}</span>
                  <span className="font-mono text-[11px] text-ink-3">{s.source_language || EM} → {s.target_language || EM}</span>
                  <span className="text-[11px] text-ink-3 tabular-nums">{s.word_count || 0} w</span>
                  <span className="text-[11px] text-ink-4">
                    {s.created_date ? formatDistanceToNow(new Date(s.created_date), { addSuffix: true }) : EM}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <section>
        <h3 className="text-[13px] font-semibold text-ink-1 mb-2 inline-flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-ink-3" /> Recent activity
          <span className="text-[10px] tabular-nums text-ink-4">{accepted.length}</span>
        </h3>
        {accepted.length === 0 ? (
          <EmptyState title="Nothing yet" body="No tasks have been processed from this connector." />
        ) : (
          <div className="space-y-1.5">
            {accepted.slice(0, 30).map((t) => (
              <div key={t.id} className="bg-surface-1 border border-line-1 rounded-md px-3 py-2 flex items-center gap-3 text-[12px]">
                {t.status === 'accepted' ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-success flex-shrink-0" />
                ) : t.status === 'rejected' ? (
                  <XCircle className="w-3.5 h-3.5 text-danger flex-shrink-0" />
                ) : (
                  <Clock className="w-3.5 h-3.5 text-ink-3 flex-shrink-0" />
                )}
                <span className="font-medium text-ink-1 truncate flex-1">{t.task_name || EM}</span>
                <span className="font-mono text-[11px] text-ink-3">{t.source_language || EM} → {t.target_language || EM}</span>
                <span className="text-[11px] text-ink-3 tabular-nums">{t.word_count || 0} w</span>
                <span className="text-[10px] text-ink-4 truncate max-w-[140px]" title={t.matched_rule}>
                  {t.matched_rule || EM}
                </span>
                <span className="text-[11px] text-ink-4 flex-shrink-0">
                  {t.accepted_at ? formatDistanceToNow(new Date(t.accepted_at), { addSuffix: true }) : EM}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}