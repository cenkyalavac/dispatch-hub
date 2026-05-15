import { useMemo } from 'react';
import { CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import { fmtNumber } from '@/lib/format';

// "Today" = anything with accepted_at OR created_date inside the user's local
// day. We use accepted_at when present (most accurate for the auto-accept
// pipeline), falling back to created_date for skipped/error rows that never
// got an accepted_at stamped.
function isToday(iso) {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth()
    && d.getDate() === now.getDate();
}

const TILE_BASE = 'bg-surface-1 border border-line-1 rounded-md p-4 flex items-start gap-3';

export default function TodayPanel({ tasks }) {
  const counts = useMemo(() => {
    let accepted = 0, errored = 0, rejected = 0;
    let words = 0;
    for (const t of tasks) {
      const stamp = t.accepted_at || t.created_date;
      if (!isToday(stamp)) continue;
      if (t.status === 'accepted') { accepted++; words += t.word_count || 0; }
      else if (t.status === 'error') errored++;
      else if (t.status === 'rejected') rejected++;
    }
    return { accepted, errored, rejected, words };
  }, [tasks]);

  return (
    <section className="mb-7">
      <h2 className="text-[14px] font-semibold text-ink-1 mb-3">Today</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className={TILE_BASE}>
          <CheckCircle2 className="w-4 h-4 text-success mt-0.5 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-ink-3">Accepted</p>
            <p className="text-[22px] font-semibold tabular-nums text-ink-1">{fmtNumber(counts.accepted)}</p>
          </div>
        </div>
        <div className={TILE_BASE}>
          <Clock className="w-4 h-4 text-ink-3 mt-0.5 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-ink-3">Words</p>
            <p className="text-[22px] font-semibold tabular-nums text-ink-1">{fmtNumber(counts.words)}</p>
          </div>
        </div>
        <div className={TILE_BASE}>
          <Clock className="w-4 h-4 text-ink-3 mt-0.5 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-ink-3">Rejected</p>
            <p className="text-[22px] font-semibold tabular-nums text-ink-1">{fmtNumber(counts.rejected)}</p>
          </div>
        </div>
        <div className={TILE_BASE}>
          <AlertCircle className={`w-4 h-4 mt-0.5 flex-shrink-0 ${counts.errored > 0 ? 'text-danger' : 'text-ink-3'}`} />
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-ink-3">Errors</p>
            <p className={`text-[22px] font-semibold tabular-nums ${counts.errored > 0 ? 'text-danger' : 'text-ink-1'}`}>{fmtNumber(counts.errored)}</p>
          </div>
        </div>
      </div>
    </section>
  );
}