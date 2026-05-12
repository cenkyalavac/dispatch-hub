import { useMemo } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { format, subDays, startOfDay } from 'date-fns';

// Son 30 gun icin gunluk accepted / rejected sayilari
export default function AcceptanceTrend({ tasks }) {
  const data = useMemo(() => {
    const days = 30;
    const today = startOfDay(new Date());
    const buckets = new Map();
    for (let i = days - 1; i >= 0; i--) {
      const d = subDays(today, i);
      buckets.set(format(d, 'yyyy-MM-dd'), { day: format(d, 'dd MMM'), accepted: 0, rejected: 0 });
    }
    for (const t of tasks) {
      if (!t.accepted_at) continue;
      const key = format(startOfDay(new Date(t.accepted_at)), 'yyyy-MM-dd');
      const b = buckets.get(key);
      if (!b) continue;
      if (t.status === 'accepted') b.accepted++;
      else if (t.status === 'rejected') b.rejected++;
    }
    return Array.from(buckets.values());
  }, [tasks]);

  return (
    <section className="bg-surface-1 border border-line-1 rounded-md p-5">
      <header className="flex items-baseline justify-between mb-3">
        <h2 className="text-[14px] font-semibold text-ink-1">Acceptance trend</h2>
        <span className="text-[11px] text-ink-3 italic-editorial">Last 30 days</span>
      </header>
      <div style={{ width: '100%', height: 220 }}>
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <defs>
              <linearGradient id="gAcc" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gRej" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--danger)" stopOpacity={0.25} />
                <stop offset="100%" stopColor="var(--danger)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--line-1)" vertical={false} />
            <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'var(--ink-3)' }} axisLine={false} tickLine={false} interval={4} />
            <YAxis tick={{ fontSize: 10, fill: 'var(--ink-3)' }} axisLine={false} tickLine={false} allowDecimals={false} width={28} />
            <Tooltip
              contentStyle={{ background: 'var(--surface-1)', border: '1px solid var(--line-1)', borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: 'var(--ink-3)', fontSize: 11 }}
            />
            <Area type="monotone" dataKey="accepted" stroke="var(--accent)" strokeWidth={2} fill="url(#gAcc)" />
            <Area type="monotone" dataKey="rejected" stroke="var(--danger)" strokeWidth={1.5} fill="url(#gRej)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}