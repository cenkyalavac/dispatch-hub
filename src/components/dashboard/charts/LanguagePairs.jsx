import { useMemo } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';

// Top 6 language pair (accepted only)
const COLORS = [
  'var(--accent)',
  'oklch(0.65 0.16 155)',
  'oklch(0.75 0.16 75)',
  'oklch(0.60 0.18 320)',
  'oklch(0.55 0.18 200)',
  'var(--ink-3)',
];

export default function LanguagePairs({ tasks }) {
  const data = useMemo(() => {
    const map = new Map();
    for (const t of tasks) {
      if (t.status !== 'accepted') continue;
      const pair = `${t.source_language || '?'} → ${t.target_language || '?'}`;
      map.set(pair, (map.get(pair) || 0) + 1);
    }
    const sorted = Array.from(map, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    if (sorted.length <= 6) return sorted;
    const top = sorted.slice(0, 5);
    const rest = sorted.slice(5).reduce((s, x) => s + x.value, 0);
    top.push({ name: 'Other', value: rest });
    return top;
  }, [tasks]);

  if (data.length === 0) {
    return (
      <section className="bg-surface-1 border border-line-1 rounded-md p-5">
        <h2 className="text-[14px] font-semibold text-ink-1 mb-3">Language pairs</h2>
        <p className="text-[12px] text-ink-3 italic-editorial">No accepted tasks yet.</p>
      </section>
    );
  }

  return (
    <section className="bg-surface-1 border border-line-1 rounded-md p-5">
      <header className="flex items-baseline justify-between mb-3">
        <h2 className="text-[14px] font-semibold text-ink-1">Language pairs</h2>
        <span className="text-[11px] text-ink-3 italic-editorial">Accepted</span>
      </header>
      <div style={{ width: '100%', height: 220 }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={50}
              outerRadius={80}
              paddingAngle={2}
              stroke="var(--surface-1)"
              strokeWidth={2}
            >
              {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip
              contentStyle={{ background: 'var(--surface-1)', border: '1px solid var(--line-1)', borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: 'var(--ink-3)', fontSize: 11 }}
            />
            <Legend
              verticalAlign="bottom"
              iconType="circle"
              wrapperStyle={{ fontSize: 11, color: 'var(--ink-3)' }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}