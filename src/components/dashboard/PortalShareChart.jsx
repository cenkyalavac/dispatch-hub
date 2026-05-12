import { useMemo } from 'react';
import { fmtNumber } from '@/lib/format';

// Horizontal bar list — portal share of accepted volume. Cheap, dependency-free.
export default function PortalShareChart({ tasks, portals }) {
  const rows = useMemo(() => {
    const byPortal = new Map();
    for (const t of tasks) {
      if (t.status !== 'accepted') continue;
      byPortal.set(t.portal, (byPortal.get(t.portal) || 0) + 1);
    }
    const max = Math.max(1, ...byPortal.values());
    const portalName = (key) => portals.find(p => p.key === key)?.name || key;
    return [...byPortal.entries()]
      .map(([key, count]) => ({ key, name: portalName(key), count, pct: count / max }))
      .sort((a, b) => b.count - a.count);
  }, [tasks, portals]);

  if (rows.length === 0) {
    return <p className="text-[12px] text-ink-3 italic-editorial">No accepted tasks yet.</p>;
  }

  return (
    <div className="space-y-2">
      {rows.map(r => (
        <div key={r.key}>
          <div className="flex items-center justify-between text-[12px] mb-1">
            <span className="text-ink-2 truncate">{r.name}</span>
            <span className="text-ink-3 tabular-nums">{fmtNumber(r.count)}</span>
          </div>
          <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all duration-premium"
              style={{ width: `${r.pct * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}