import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Webhook, CheckCircle2, XCircle, Clock, ArrowRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { EM } from '@/lib/format';

// "Webhook timeline" — last 10 outbound deliveries from the WebhookDelivery
// log, rendered as a compact vertical timeline. Surfaces failures early so
// integrations don't go silently broken.
//
// We deliberately don't poll on a tight interval — the dashboard is a glance,
// not a monitor. 60s staleTime keeps it fresh-enough.

const STATUS_ICON = {
  success:        { Icon: CheckCircle2, cls: 'text-success' },
  failed:         { Icon: XCircle,       cls: 'text-danger' },
  pending:        { Icon: Clock,         cls: 'text-ink-3' },
  retry_scheduled:{ Icon: Clock,         cls: 'text-warning' },
};

function StatusDot({ status }) {
  const cfg = STATUS_ICON[status] || STATUS_ICON.pending;
  const { Icon } = cfg;
  return <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${cfg.cls}`} title={status} />;
}

export default function WebhookTimelinePanel() {
  const { data: deliveries = [], isLoading } = useQuery({
    queryKey: ['webhook-timeline'],
    queryFn: () => base44.entities.WebhookDelivery.list('-created_date', 10),
    staleTime: 60_000,
  });

  const stats = useMemo(() => {
    let success = 0, failed = 0;
    for (const d of deliveries) {
      if (d.status === 'success') success++;
      else if (d.status === 'failed') failed++;
    }
    return { success, failed };
  }, [deliveries]);

  return (
    <section className="bg-surface-1 border border-line-1 rounded-md p-5">
      <div className="flex items-end justify-between mb-3">
        <div>
          <h2 className="text-[14px] font-semibold text-ink-1 inline-flex items-center gap-1.5">
            <Webhook className="w-3.5 h-3.5 text-ink-3" /> Webhook timeline
          </h2>
          <p className="text-[12px] text-ink-3 italic-editorial mt-0.5">
            Last 10 outbound deliveries to your BMS subscribers.
          </p>
        </div>
        {deliveries.length > 0 && (
          <div className="flex items-center gap-3 text-[11px] tabular-nums">
            <span className="text-success">✓ {stats.success}</span>
            {stats.failed > 0 && <span className="text-danger">✗ {stats.failed}</span>}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-6" />)}</div>
      ) : deliveries.length === 0 ? (
        <p className="text-[12px] text-ink-3 italic-editorial py-4 text-center">
          No webhook activity yet.
        </p>
      ) : (
        <ol className="relative ml-1.5 border-l border-line-1 space-y-2 pl-4">
          {deliveries.map(d => {
            const when = d.delivered_at || d.created_date;
            const httpLabel = d.http_status ? `HTTP ${d.http_status}` : '';
            return (
              <li key={d.id} className="relative">
                <span className="absolute -left-[22px] top-1 bg-surface-1 p-0.5 rounded-full">
                  <StatusDot status={d.status} />
                </span>
                <div className="flex items-center gap-2 text-[12px]">
                  <span className="font-mono uppercase tracking-wider text-[10px] text-ink-3 flex-shrink-0">
                    {d.event}
                  </span>
                  <span className="text-ink-1 truncate flex-1" title={d.url}>
                    {d.url || EM}
                  </span>
                  {httpLabel && (
                    <span className={`text-[10px] tabular-nums flex-shrink-0 ${d.status === 'failed' ? 'text-danger' : 'text-ink-3'}`}>
                      {httpLabel}
                    </span>
                  )}
                  <span className="text-[10px] text-ink-4 tabular-nums flex-shrink-0">
                    {when ? formatDistanceToNow(new Date(when), { addSuffix: true }) : EM}
                  </span>
                </div>
                {d.status === 'failed' && d.error && (
                  <p className="text-[11px] text-danger truncate mt-0.5" title={d.error}>{d.error}</p>
                )}
              </li>
            );
          })}
        </ol>
      )}

      <div className="mt-3 text-right">
        <Link
          to="/api"
          className="inline-flex items-center gap-1 text-[11px] text-ink-3 hover:text-ink-1 transition-colors duration-tab"
        >
          Manage subscribers <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    </section>
  );
}