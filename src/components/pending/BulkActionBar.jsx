import { CheckCircle2, XCircle, X, Loader2 } from 'lucide-react';

// Reused by Pending (accept/reject) and Issues (reset).
// `acceptLabel` / `rejectLabel` are display-only — the buttons fire whatever callback you pass.
// `progress` (optional) = { current, total, ok, fail } shown while a bulk op runs so the
// user can watch sequential calls march along instead of staring at a dead button.
export default function BulkActionBar({
  count, busy, progress = null,
  onAccept = null, onReject = null, onClear,
  canReject = true,
  acceptLabel = 'Accept selected',
  rejectLabel = 'Reject selected',
}) {
  if (count === 0) return null;
  const pct = progress && progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
  return (
    <div className="sticky top-[92px] z-30 mb-3 bg-accent text-white rounded-md shadow-lg overflow-hidden">
      {/* Progress strip — visible only while a bulk op is running. */}
      {busy && progress && (
        <div className="h-1 bg-white/20">
          <div className="h-full bg-white transition-[width] duration-tab" style={{ width: `${pct}%` }} />
        </div>
      )}
      <div className="flex items-center gap-3 px-4 py-2">
      <span className="text-[13px] font-medium inline-flex items-center gap-2">
        {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        {busy && progress
          ? <>Processing <span className="tabular-nums">{progress.current}</span> of <span className="tabular-nums">{progress.total}</span>
              {progress.fail > 0 && <span className="text-white/70">· {progress.fail} failed</span>}
            </>
          : <>{count} selected</>}
      </span>
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
          disabled={busy}
          className="inline-flex items-center justify-center w-7 h-7 rounded-md hover:bg-white/15 transition-colors duration-tab disabled:opacity-40"
          title="Clear selection"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      </div>
    </div>
  );
}