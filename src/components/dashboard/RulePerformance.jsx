import { useMemo } from 'react';
import { fmtNumber } from '@/lib/format';

// How often each rule fired, and whether it accepted or rejected.
// Unmatched/manual rows are bucketed at the bottom ("Manual / no rule").
export default function RulePerformance({ tasks, rules, limit = 6 }) {
  const rows = useMemo(() => {
    const stats = new Map();
    for (const t of tasks) {
      // Fall back to a stable bucket key when no rule matched (manual/legacy rows).
      const key = t.matched_rule || '— no rule';
      const label = t.matched_rule || 'Manual / no rule';
      if (!stats.has(key)) stats.set(key, { key, label, accepted: 0, rejected: 0, total: 0 });
      const s = stats.get(key);
      s.total++;
      if (t.status === 'accepted') s.accepted++;
      else if (t.status === 'rejected') s.rejected++;
    }
    const activeNames = new Set(rules.map(r => r.name));
    const result = [...stats.values()].sort((a, b) => b.total - a.total).slice(0, limit);
    return result.map(r => ({
      ...r,
      inactive: r.label !== 'Manual / no rule' && r.label !== 'Manual' && !activeNames.has(r.label),
    }));
  }, [tasks, rules, limit]);

  if (rows.length === 0) {
    return <p className="text-[12px] text-ink-3 italic-editorial">No rule activity yet.</p>;
  }

  return (
    <table className="w-full text-[12px]">
      <thead>
        <tr className="text-[10px] uppercase tracking-wider text-ink-3 border-b border-line-1">
          <th className="text-left py-1.5 font-medium">Rule</th>
          <th className="text-right py-1.5 font-medium">Acc</th>
          <th className="text-right py-1.5 font-medium">Rej</th>
          <th className="text-right py-1.5 font-medium">Total</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.key} className="border-b border-line-1 last:border-0">
            <td className="py-1.5 text-ink-1 truncate max-w-[180px]" title={r.label}>
              {r.label}
              {r.inactive && <span className="ml-1.5 text-[10px] uppercase tracking-wider text-ink-4">inactive</span>}
            </td>
            <td className="py-1.5 text-right tabular-nums text-success">{fmtNumber(r.accepted)}</td>
            <td className="py-1.5 text-right tabular-nums text-danger">{fmtNumber(r.rejected)}</td>
            <td className="py-1.5 text-right tabular-nums text-ink-2">{fmtNumber(r.total)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}