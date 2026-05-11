export default function Metric({ label, value, sub }) {
  return (
    <div className="bg-surface-1 border border-line-1 rounded-md p-3.5">
      <p className="text-[10px] uppercase tracking-wider text-ink-3">{label}</p>
      <p className="text-[22px] font-semibold tabular-nums mt-0.5 text-ink-1">{value}</p>
      {sub && <p className="text-[11px] text-ink-3 italic-editorial mt-0.5 truncate">{sub}</p>}
    </div>
  );
}