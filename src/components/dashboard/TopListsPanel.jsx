import { useMemo } from 'react';
import { fmtNumber, EM } from '@/lib/format';

// "Top clients & language pairs" over the last 30 days. Tasks already pre-
// filtered upstream (status='accepted'). Two side-by-side leaderboards,
// quiet — no charts, just ranked rows with a thin bar to convey relative size.

function topNFromCounter(counter, n = 5) {
  return Object.entries(counter)
    .filter(([k]) => k && k !== EM)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

function Bar({ value, max }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-1 rounded-full bg-surface-2 overflow-hidden">
      <div className="h-full bg-accent/70" style={{ width: `${pct}%` }} />
    </div>
  );
}

function List({ title, rows }) {
  const max = rows[0]?.[1] || 0;
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-ink-3 mb-2">{title}</p>
      {rows.length === 0 ? (
        <p className="text-[12px] text-ink-3 italic-editorial py-4 text-center">No data yet.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map(([label, value]) => (
            <li key={label}>
              <div className="flex items-center justify-between mb-1 text-[12px]">
                <span className="text-ink-1 truncate pr-3">{label}</span>
                <span className="text-ink-3 tabular-nums flex-shrink-0">{fmtNumber(value)}</span>
              </div>
              <Bar value={value} max={max} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function TopListsPanel({ tasks }) {
  const { clients, pairs } = useMemo(() => {
    const cutoff = Date.now() - 30 * 86400000;
    const c = {}, p = {};
    for (const t of tasks) {
      if (t.status !== 'accepted') continue;
      const stamp = t.accepted_at ? new Date(t.accepted_at).getTime() : 0;
      if (stamp < cutoff) continue;
      const client = t.client_name || EM;
      c[client] = (c[client] || 0) + 1;
      const pair = `${t.source_language || EM} → ${t.target_language || EM}`;
      p[pair] = (p[pair] || 0) + 1;
    }
    return { clients: topNFromCounter(c), pairs: topNFromCounter(p) };
  }, [tasks]);

  return (
    <section className="bg-surface-1 border border-line-1 rounded-md p-5">
      <h2 className="text-[14px] font-semibold text-ink-1 mb-1">Top clients & language pairs</h2>
      <p className="text-[12px] text-ink-3 italic-editorial mb-4">Last 30 days, accepted only.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <List title="Clients" rows={clients} />
        <List title="Language pairs" rows={pairs} />
      </div>
    </section>
  );
}