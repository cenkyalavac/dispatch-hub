import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

// Builds the last `days` days of accepted/rejected counts. Empty days appear as zero.
export default function TrendChart({ tasks, days = 14 }) {
  const data = useMemo(() => {
    const buckets = new Map();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 86400000);
      const key = d.toISOString().slice(0, 10);
      buckets.set(key, { day: key, label: d.toLocaleDateString('en', { day: '2-digit', month: 'short' }), accepted: 0, rejected: 0 });
    }
    for (const t of tasks) {
      if (!t.accepted_at) continue;
      const key = t.accepted_at.slice(0, 10);
      const b = buckets.get(key);
      if (!b) continue;
      if (t.status === 'accepted') b.accepted++;
      else if (t.status === 'rejected') b.rejected++;
    }
    return [...buckets.values()];
  }, [tasks, days]);

  return (
    <div className="h-[180px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
          <CartesianGrid stroke="var(--line-1)" strokeDasharray="2 2" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--ink-3)' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 10, fill: 'var(--ink-3)' }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip
            contentStyle={{ background: 'var(--surface-1)', border: '1px solid var(--line-1)', borderRadius: 6, fontSize: 12 }}
            labelStyle={{ color: 'var(--ink-2)' }}
          />
          <Line type="monotone" dataKey="accepted" stroke="var(--accent)" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="rejected" stroke="var(--danger)" strokeWidth={1.5} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}