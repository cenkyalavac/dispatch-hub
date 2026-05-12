import { useMemo } from 'react';
import { fmtNumber } from '@/lib/format';

// Top language pairs by accepted count. Compact bar list.
export default function LangPairChart({ tasks, limit = 6 }) {
  const rows = useMemo(() => {
    const m = new Map();
    for (const t of tasks) {
      if (t.status !== 'accepted') continue;
      if (!t.source_language || !t.target_language) continue;
      const key = `${t.source_language}→${t.target_language}`;
      m.set(key, (m.get(key) || 0) + 1);
    }
    const max = Math.max(1, ...m.values());
    return [...m.entries()]
      .map(([pair, count]) => ({ pair, count, pct: count / max }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }, [tasks, limit]);

  if (rows.length === 0) {
    return <p className="text-[12px] text-ink-3 italic-editorial">No language pairs yet.</p>;
  }

  return (
    <div className="space-y-2">
      {rows.map(r => (
        <div key={r.pair}>
          <div className="flex items-center justify-between text-[12px] mb-1">
            <span className="font-mono text-ink-2">{r.pair}</span>
            <span className="text-ink-3 tabular-nums">{fmtNumber(r.count)}</span>
          </div>
          <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
            <div
              className="h-full bg-ink-2 rounded-full transition-all duration-premium"
              style={{ width: `${r.pct * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}