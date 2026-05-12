import { CheckCircle2, XCircle, RefreshCw, X } from 'lucide-react';
import { fmtNumber } from '@/lib/format';

// Sticky-ish toolbar shown above the list when at least one task is selected.
export default function BulkActionBar({ count, busy, onAccept, onReject, onClear, canReject }) {
  if (count === 0) return null;
  return (
    <div className="bg-surface-1 border border-accent rounded-md px-4 py-2.5 mb-3 flex items-center gap-3 shadow-sm animate-slide-down">
      <span className="text-[13px] text-ink-1">
        <span className="font-semibold tabular-nums">{fmtNumber(count)}</span> selected
      </span>
      <div className="flex-1" />
      <button
        onClick={onAccept}
        disabled={busy}
        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-accent text-white text-[12px] font-medium hover:bg-[var(--accent-hover)] transition-colors duration-tab disabled:opacity-40"
      >
        {busy ? <RefreshCw className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
        Accept {count}
      </button>
      {canReject && (
        <button
          onClick={onReject}
          disabled={busy}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-line-1 bg-surface-1 text-[12px] text-danger hover:bg-danger-soft transition-colors duration-tab disabled:opacity-40"
        >
          <XCircle className="w-3 h-3" /> Reject
        </button>
      )}
      <button
        onClick={onClear}
        className="inline-flex items-center gap-1 h-8 px-2 rounded text-[12px] text-ink-3 hover:bg-surface-2 hover:text-ink-1 transition-colors duration-tab"
      >
        <X className="w-3 h-3" /> Clear
      </button>
    </div>
  );
}