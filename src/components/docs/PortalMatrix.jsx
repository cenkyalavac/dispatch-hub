import { Check, Minus, Circle, AlertTriangle } from 'lucide-react';

// Visual badge per cell-state. Tuned for at-a-glance scanning — a BMS dev
// reading this should be able to spot the per-portal coverage gaps in <5s.
const STATE_STYLES = {
  full:    { icon: Check,          cls: 'text-success bg-success-soft',       label: 'Full' },
  partial: { icon: AlertTriangle,  cls: 'text-warning bg-warning-soft',       label: 'Partial' },
  none:    { icon: Minus,          cls: 'text-ink-3 bg-surface-2',            label: 'Not wired' },
  na:      { icon: Circle,         cls: 'text-ink-4 bg-surface-2',            label: 'N/A' },
};

function Cell({ value }) {
  if (!value) return <td className="px-3 py-2"></td>;
  const cfg = STATE_STYLES[value.state] || STATE_STYLES.none;
  const Icon = cfg.icon;
  return (
    <td className="px-3 py-2 align-top">
      <div className="flex items-start gap-2">
        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider ${cfg.cls}`}>
          <Icon className="w-3 h-3" /> {cfg.label}
        </span>
      </div>
      {value.note && (
        <p className="text-[11.5px] text-ink-3 italic-editorial mt-1.5 leading-snug">
          {value.note}
        </p>
      )}
    </td>
  );
}

// Renders a capability × portal coverage matrix. Source data: lib/docs/portal-matrix.js.
export default function PortalMatrix({ rows, columns }) {
  return (
    <div className="border border-line-1 rounded-md overflow-hidden overflow-x-auto">
      <table className="w-full text-[12.5px] min-w-[760px]">
        <thead className="bg-surface-2 text-ink-3">
          <tr>
            <th className="text-left px-3 py-2.5 font-medium w-[200px]">Capability</th>
            {columns.map((c) => (
              <th key={c.key} className="text-left px-3 py-2.5 font-medium">
                <div className="text-ink-1">{c.label}</div>
                <div className="text-[10px] uppercase tracking-wider text-ink-4 font-normal mt-0.5">{c.sub}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line-1">
          {rows.map((row) => (
            <tr key={row.capability} className="align-top">
              <td className="px-3 py-2 align-top">
                <div className="font-medium text-ink-1">{row.label}</div>
                <code className="font-mono text-[10.5px] text-ink-3">{row.capability}</code>
              </td>
              {columns.map((c) => (
                <Cell key={c.key} value={row[c.key]} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}