import { useMemo } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

// Portal basina accepted/rejected sayisi
export default function PortalBreakdown({ tasks, portals }) {
  const data = useMemo(() => {
    const map = new Map();
    for (const t of tasks) {
      const key = t.portal || 'unknown';
      const row = map.get(key) || { portal: key, accepted: 0, rejected: 0 };
      if (t.status === 'accepted') row.accepted++;
      else if (t.status === 'rejected') row.rejected++;
      map.set(key, row);
    }
    return Array.from(map.values()).map(r => {
      const p = portals.find(x => x.key === r.portal);
      return { ...r, name: p?.name || r.portal };
    });
  }, [tasks, portals]);

  return (
    <section className="bg-surface-1 border border-line-1 rounded-md p-5">
      <header className="flex items-baseline justify-between mb-3">
        <h2 className="text-[14px] font-semibold text-ink-1">By connector</h2>
        <span className="text-[11px] text-ink-3 italic-editorial">All-time</span>
      </header>
      <div style={{ width: '100%', height: 220 }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid stroke="var(--line-1)" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--ink-3)' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: 'var(--ink-3)' }} axisLine={false} tickLine={false} allowDecimals={false} width={28} />
            <Tooltip
              contentStyle={{ background: 'var(--surface-1)', border: '1px solid var(--line-1)', borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: 'var(--ink-3)', fontSize: 11 }}
              cursor={{ fill: 'var(--surface-2)' }}
            />
            <Bar dataKey="accepted" fill="var(--accent)" radius={[4, 4, 0, 0]} />
            <Bar dataKey="rejected" fill="var(--danger)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}