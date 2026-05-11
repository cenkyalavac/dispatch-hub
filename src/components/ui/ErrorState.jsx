import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function ErrorState({ error, onRetry }) {
  const message = error?.message || (typeof error === 'string' ? error : 'Something went wrong.');
  return (
    <div className="bg-danger-soft border border-danger/20 rounded-md px-6 py-8 text-center">
      <AlertTriangle className="w-5 h-5 text-danger mx-auto mb-2" />
      <h3 className="text-[14px] font-semibold text-ink-1">Couldn't load</h3>
      <p className="text-[13px] text-ink-2 italic-editorial mt-1 max-w-md mx-auto">{message}</p>
      {onRetry && (
        <button
          onClick={() => onRetry()}
          className="mt-4 inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-line-1 bg-surface-1 text-[12px] text-ink-2 hover:bg-surface-2 transition-colors duration-tab"
        >
          <RefreshCw className="w-3 h-3" /> Try again
        </button>
      )}
    </div>
  );
}