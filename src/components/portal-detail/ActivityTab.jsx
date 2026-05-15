import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { CheckCircle2, AlertCircle, SkipForward, XCircle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/ui/EmptyState';
import { EM } from '@/lib/format';

// Recent AcceptedTask rows for this portal (accepted / skipped / rejected /
// error). Read-only — full management still lives on /tasks and /history.
const STATUS_META = {
  accepted: { Icon: CheckCircle2, color: 'text-success', label: 'Accepted' },
  skipped:  { Icon: SkipForward,  color: 'text-ink-3',  label: 'Skipped' },
  rejected: { Icon: XCircle,      color: 'text-ink-3',  label: 'Rejected' },
  error:    { Icon: AlertCircle,  color: 'text-danger', label: 'Error' },
};

export default function ActivityTab({ portal }) {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['portal-activity', portal.key],
    queryFn: () => base44.entities.AcceptedTask.filter({ portal: portal.key }, '-created_date', 50),
  });

  if (isLoading) return <Skeleton className="h-64" />;
  if (rows.length === 0) {
    return (
      <EmptyState
        title="No activity yet"
        body={`Nothing has been processed from ${portal.name} so far.`}
      />
    );
  }

  return (
    <div className="bg-surface-1 border border-line-1 rounded-md overflow-hidden">
      <header className="px-4 py-2.5 border-b border-line-1 flex items-baseline justify-between">
        <h3 className="text-[13px] font-semibold text-ink-1">Recent activity</h3>
        <span className="text-[11px] text-ink-3 italic-editorial">last 50 events</span>
      </header>
      <div className="divide-y divide-line-1">
        {rows.map((r) => {
          const meta = STATUS_META[r.status] || STATUS_META.skipped;
          const Icon = meta.Icon;
          const stamp = r.accepted_at || r.created_date;
          return (
            <div key={r.id} className="px-4 py-2.5 flex items-center gap-3">
              <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${meta.color}`} />
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-medium text-ink-1 truncate">
                  {r.task_name || EM}
                </p>
                <p className="text-[11px] text-ink-3 truncate font-mono">
                  {r.source_language || EM} → {r.target_language || EM}
                  {r.project_name && <span className="font-sans"> · {r.project_name}</span>}
                  {r.matched_rule && <span className="font-sans"> · {r.matched_rule}</span>}
                </p>
              </div>
              <span className="text-[11px] text-ink-3 italic-editorial flex-shrink-0">
                {stamp ? formatDistanceToNow(new Date(stamp), { addSuffix: true }) : EM}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}