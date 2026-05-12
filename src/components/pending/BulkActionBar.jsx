import { CheckCircle2, XCircle, X } from 'lucide-react';

// Reused by Pending (accept/reject) and Issues (reset).
// `acceptLabel` / `rejectLabel` are display-only — the buttons fire whatever callback you pass.
export default function BulkActionBar({
  count, busy,
  onAccept, onReject, onClear,
  canReject = true,
  acceptLabel = 'Accept selected',
  rejectLabel = 'Reject selected',
}) {
  if (count === 0) return null;
  return (
    <div className="sticky top-[92px] z-30 mb-3 flex items-center gap-3 px-4 py-2 bg-accent text-white rounded-md shadow-lg">
      <span className="text-[13px] font-medium">{count} selected</span>
      <div className="ml-auto flex items-center gap-2">
        {onAccept && (
          <button
            onClick={onAccept}
            disabled={busy}
            className="inline-flex items-center gap-1.5 h-7 px-3 rounded-md bg-white/15 hover:bg-white/25 text-[12px] font-medium transition-colors duration-tab disabled:opacity-40"
          >
            <CheckCircle2 className="w-3.5 h-3.5" /> {acceptLabel}
          </button>
        )}
        {canReject && onReject && (
          <button
            onClick={onReject}
            disabled={busy}
            className="inline-flex items-center gap-1.5 h-7 px-3 rounded-md bg-white/15 hover:bg-white/25 text-[12px] font-medium transition-colors duration-tab disabled:opacity-40"
          >
            <XCircle className="w-3.5 h-3.5" /> {rejectLabel}
          </button>
        )}
        <button
          onClick={onClear}
          className="inline-flex items-center justify-center w-7 h-7 rounded-md hover:bg-white/15 transition-colors duration-tab"
          title="Clear selection"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}