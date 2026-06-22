import { fmtNumber } from '@/lib/format';

function KpiCard({ label, value, sub }) {
  return (
    <div className="bg-surface-1 border border-line-1 rounded-md px-4 py-3.5">
      <div className="text-[11px] uppercase tracking-wider text-ink-3 font-medium">{label}</div>
      <div className="text-[26px] font-semibold tracking-tight text-ink-1 tabular-nums mt-1 leading-none">{value}</div>
      {sub && <div className="text-[11px] text-ink-3 italic-editorial mt-1">{sub}</div>}
    </div>
  );
}

export default function KpiCards({ projects }) {
  const now = Date.now();
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

  const active = projects.filter((p) => p.status !== 'delivered');
  const awaiting = projects.filter((p) => p.status === 'in_translate');
  const deliveredRecent = projects.filter((p) => {
    if (p.status !== 'delivered' || !p.deliveredAt) return false;
    const t = new Date(p.deliveredAt).getTime();
    return !Number.isNaN(t) && t >= weekAgo;
  });
  const pipelineWords = active.reduce((sum, p) => sum + (Number(p.totalWords) || 0), 0);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
      <KpiCard label="Active projects" value={fmtNumber(active.length)} sub="Not yet delivered" />
      <KpiCard label="Awaiting delivery" value={fmtNumber(awaiting.length)} sub="In translation" />
      <KpiCard label="Delivered (7d)" value={fmtNumber(deliveredRecent.length)} sub="Last 7 days" />
      <KpiCard label="Words in pipeline" value={fmtNumber(pipelineWords)} sub="Across active projects" />
    </div>
  );
}