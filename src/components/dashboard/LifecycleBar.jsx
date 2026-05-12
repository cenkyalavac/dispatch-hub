import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { fmtNumber } from '@/lib/format';

// 4-state lifecycle: Accepted → Synchronized → Delivered. Failed is surfaced separately.
// All counts are passed in; this component is purely presentational.
const STATES = [
  { key: 'accepted',     label: 'Accepted',     hint: 'Awaiting pickup' },
  { key: 'synchronized', label: 'Synchronized', hint: 'BMS acknowledged' },
  { key: 'delivered',    label: 'Delivered',    hint: 'Final state' },
];

export default function LifecycleBar({ counts }) {
  const total = STATES.reduce((sum, s) => sum + (counts[s.key] || 0), 0);
  const failed = counts.failed_to_sync || 0;

  if (total === 0 && failed === 0) {
    return (
      <p className="text-[12px] text-ink-3 italic-editorial">
        No projects flowing through the hub yet.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stacked progress bar — proportions of the 3 healthy states */}
      <div className="space-y-2">
        <div className="flex h-2 rounded-full overflow-hidden bg-surface-2">
          {STATES.map((s, i) => {
            const n = counts[s.key] || 0;
            const pct = total > 0 ? (n / total) * 100 : 0;
            if (pct === 0) return null;
            const tone = i === 0 ? 'bg-ink-3' : i === 1 ? 'bg-accent' : 'bg-success';
            return (
              <div
                key={s.key}
                className={`${tone} transition-all duration-premium`}
                style={{ width: `${pct}%` }}
                title={`${s.label}: ${n}`}
              />
            );
          })}
        </div>

        <div className="grid grid-cols-3 gap-3">
          {STATES.map((s, i) => {
            const tone = i === 0 ? 'bg-ink-3' : i === 1 ? 'bg-accent' : 'bg-success';
            return (
              <div key={s.key}>
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${tone}`} />
                  <span className="text-[11px] uppercase tracking-wider text-ink-3">{s.label}</span>
                </div>
                <p className="text-[20px] font-semibold tabular-nums mt-0.5 text-ink-1">
                  {fmtNumber(counts[s.key] || 0)}
                </p>
                <p className="text-[11px] text-ink-3 italic-editorial">{s.hint}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Failed strip — separate, calls for attention only when > 0 */}
      {failed > 0 ? (
        <Link
          to="/issues"
          className="flex items-center gap-3 px-4 py-3 rounded-md border border-danger bg-danger-soft hover:bg-danger/10 transition-colors duration-tab"
        >
          <AlertTriangle className="w-4 h-4 text-danger flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-danger">
              {fmtNumber(failed)} project{failed === 1 ? '' : 's'} failed to sync
            </p>
            <p className="text-[11px] text-ink-3 italic-editorial mt-0.5">
              Open Issues to inspect errors and retry.
            </p>
          </div>
          <ArrowRight className="w-3.5 h-3.5 text-danger flex-shrink-0" />
        </Link>
      ) : (
        <div className="flex items-center gap-2 text-[12px] text-ink-3 italic-editorial">
          <span className="w-1.5 h-1.5 rounded-full bg-success" />
          All projects flowing cleanly — no failures.
        </div>
      )}
    </div>
  );
}