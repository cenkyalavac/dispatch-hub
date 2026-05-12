import { useMemo } from 'react';
import { fmtNumber } from '@/lib/format';

// Hangi kural kac task'i isaretledi — basit bir bar listesi
export default function RulePerformance({ tasks }) {
  const data = useMemo(() => {
    const map = new Map();
    for (const t of tasks) {
      const key = t.matched_rule || 'Manual';
      map.set(key, (map.get(key) || 0) + 1);
    }
    const arr = Array.from(map, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    return arr.slice(0, 8);
  }, [tasks]);

  const max = data[0]?.value || 1;

  return (
    <section className="bg-surface-1 border border-line-1 rounded-md p-5">
      <header className="flex items-baseline justify-between mb-4">
        <h2 className="text-[14px] font-semibold text-ink-1">Top rules</h2>
        <span className="text-[11px] text-ink-3 italic-editorial">By matches</span>
      </header>
      {data.length === 0 ? (
        <p className="text-[12px] text-ink-3 italic-editorial">No rule matches yet.</p>
      ) : (
        <div className="space-y-2.5">
          {data.map(r => (
            <div key={r.name}>
              <div className="flex items-center justify-between text-[12px] mb-1">
                <span className="text-ink-2 truncate" title={r.name}>{r.name}</span>
                <span className="font-medium tabular-nums text-ink-1">{fmtNumber(r.value)}</span>
              </div>
              <div className="h-1.5 bg-surface-2 rounded overflow-hidden">
                <div
                  className="h-full bg-accent rounded transition-all duration-premium"
                  style={{ width: `${(r.value / max) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}