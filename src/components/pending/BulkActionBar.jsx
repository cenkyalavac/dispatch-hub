import { CheckCircle2, XCircle, X, RefreshCw } from 'lucide-react';
import { fmtNumber } from '@/lib/format';

export default function BulkActionBar({ count, onAcceptAll, onRejectAll, onClear, busy }) {
  if (count === 0) return null;
  return (
    <div className="sticky top-[52px] z-20 -mx-8 px-8 py-2.5 bg-accent-soft border-y border-line-1 flex items-center gap-3 flex-wrap mb-4">
      <span className="text-[13px] font-medium text-accent-ink tabular-nums">
        {fmtNumber(count)} selected
      </span>
      <div className="ml-auto flex items-center gap-2">
        <button
          onClick={onAcceptAll}
          disabled={busy}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-success text-white text-[12px] font-medium hover:opacity-90 transition-opacity duration-tab disabled:opacity-40"
        >
          {busy ? <RefreshCw className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
          Accept selected
        </button>
        <button
          onClick={onRejectAll}
          disabled={busy}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-danger text-white text-[12px] font-medium hover:opacity-90 transition-opacity duration-tab disabled:opacity-40"
        >
          {busy ? <RefreshCw className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
          Reject selected
        </button>
        <button
          onClick={onClear}
          disabled={busy}
          className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md text-[12px] text-ink-3 hover:bg-surface-1 transition-colors duration-tab disabled:opacity-40"
        >
          <X className="w-3 h-3" /> Clear
        </button>
      </div>
    </div>
  );
}