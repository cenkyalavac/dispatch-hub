import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Truck, CheckCircle2, ArrowRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { fmtNumber, EM } from '@/lib/format';
import { useFriendlyNames } from '@/lib/friendly';
import { Skeleton } from '@/components/ui/skeleton';

// "Recent deliveries" — projects that reached state='delivered' in the last
// 7 days. Reads from the Project entity only; the dashboard is a read-only
// view of what already happened downstream.
//
// Operations want to see two things at a glance:
//   • how many projects we shipped this week (the trophy number)
//   • which were the most recent ones (so they can sanity-check)
// That's the panel. No charts, no breakdowns — those live elsewhere.

export default function RecentDeliveriesPanel() {
  const { friendly } = useFriendlyNames();
  const { data: delivered = [], isLoading } = useQuery({
    queryKey: ['recent-deliveries'],
    queryFn: () => base44.entities.Project.filter({ state: 'delivered' }, '-delivered_at', 50),
    staleTime: 60_000,
  });

  const { weekCount, rows } = useMemo(() => {
    const cutoff = Date.now() - 7 * 86400000;
    const recent = delivered.filter(p => {
      const t = p.delivered_at ? new Date(p.delivered_at).getTime() : 0;
      return t >= cutoff;
    });
    return { weekCount: recent.length, rows: recent.slice(0, 5) };
  }, [delivered]);

  return (
    <section className="bg-surface-1 border border-line-1 rounded-md p-5">
      <div className="flex items-end justify-between mb-3">
        <div>
          <h2 className="text-[14px] font-semibold text-ink-1 inline-flex items-center gap-1.5">
            <Truck className="w-3.5 h-3.5 text-ink-3" /> Recent deliveries
          </h2>
          <p className="text-[12px] text-ink-3 italic-editorial mt-0.5">Projects shipped to the BMS in the last 7 days.</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wider text-ink-3">This week</p>
          <p className="text-[26px] font-semibold tabular-nums text-success leading-none mt-1">{fmtNumber(weekCount)}</p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-1.5">{[1, 2, 3].map(i => <Skeleton key={i} className="h-8" />)}</div>
      ) : rows.length === 0 ? (
        <p className="text-[12px] text-ink-3 italic-editorial py-4 text-center">
          No deliveries in the last 7 days.
        </p>
      ) : (
        <div className="divide-y divide-line-1 border border-line-1 rounded-md">
          {rows.map(p => {
            const clientLabel = friendly(p, 'client') || p.client_name || EM;
            return (
              <div key={p.id} className="flex items-center gap-3 px-3 py-2 text-[12px]">
                <CheckCircle2 className="w-3.5 h-3.5 text-success flex-shrink-0" />
                <span className="font-medium text-ink-1 truncate flex-1">{p.name || p.project_name || EM}</span>
                <span className="text-ink-3 truncate hidden sm:block max-w-[140px]">{clientLabel}</span>
                <span className="font-mono text-[11px] text-ink-3 flex-shrink-0">
                  {p.source_language || EM}→{p.target_language || EM}
                </span>
                <span className="text-[11px] text-ink-3 tabular-nums flex-shrink-0">{fmtNumber(p.word_count || 0)} w</span>
                <span className="text-[10px] text-ink-4 tabular-nums flex-shrink-0 w-[78px] text-right">
                  {p.delivered_at ? formatDistanceToNow(new Date(p.delivered_at), { addSuffix: true }) : EM}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {delivered.length > rows.length && (
        <div className="mt-3 text-right">
          <Link
            to="/api"
            className="inline-flex items-center gap-1 text-[11px] text-ink-3 hover:text-ink-1 transition-colors duration-tab"
          >
            All projects <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      )}
    </section>
  );
}