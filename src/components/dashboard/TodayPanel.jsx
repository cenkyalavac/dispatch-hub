import { useMemo } from 'react';
import { fmtNumber } from '@/lib/format';

// "Today" — operational at-a-glance for the current local day.
// Uses AcceptedTask.accepted_at (local-time start-of-day) so the user sees
// what actually happened since they sat down at their desk.
export default function TodayPanel({ tasks }) {
  const stats = useMemo(() => {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const startMs = start.getTime();
    let accepted = 0, rejected = 0, errored = 0;
    for (const t of tasks) {
      const stamp = t.accepted_at ? new Date(t.accepted_at).getTime() : 0;
      if (stamp < startMs) continue;
      if (t.status === 'accepted') accepted++;
      else if (t.status === 'rejected') rejected++;
      else if (t.status === 'error') errored++;
    }
    return { accepted, rejected, errored };
  }, [tasks]);

  return (
    <section className="bg-surface-1 border border-line-1 rounded-md p-5">
      <h2 className="text-[14px] font-semibold text-ink-1 mb-1">Today</h2>
      <p className="text-[12px] text-ink-3 italic-editorial mb-4">What happened since midnight.</p>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-ink-3">Accepted</p>
          <p className="text-[26px] font-semibold tabular-nums mt-1 text-success">{fmtNumber(stats.accepted)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-ink-3">Rejected</p>
          <p className="text-[26px] font-semibold tabular-nums mt-1 text-ink-2">{fmtNumber(stats.rejected)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-ink-3">Errors</p>
          <p className={`text-[26px] font-semibold tabular-nums mt-1 ${stats.errored > 0 ? 'text-danger' : 'text-ink-2'}`}>
            {fmtNumber(stats.errored)}
          </p>
        </div>
      </div>
    </section>
  );
}