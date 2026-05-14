import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, BarChart3 } from 'lucide-react';

// Renders the 12-band TM stats breakdown when available; otherwise prompts the user
// to fetch it on demand. Reading the row.leverage object is forgiving — PD has
// shifted shape between versions so we walk the common keys.
function flattenLeverage(leverage) {
  if (!leverage || typeof leverage !== 'object') return [];
  // If the API returned the cumulativeTmStatistics object, it usually has buckets
  // keyed by match-range (e.g. "Repetitions", "100%", "95-99%", ...). Render whatever's there.
  return Object.entries(leverage)
    .filter(([_, v]) => v && typeof v === 'object')
    .map(([band, stats]) => ({
      band,
      words: stats.wordCount ?? stats.words ?? stats.count ?? null,
      segments: stats.segmentCount ?? stats.segments ?? null,
    }))
    .filter((b) => b.words !== null || b.segments !== null);
}

export default function LeveragePanel({ row, onFetch }) {
  const [loading, setLoading] = useState(false);
  const bands = flattenLeverage(row.leverage);

  const handleFetch = async () => {
    setLoading(true);
    try {
      await onFetch();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border-t border-line-1 bg-surface-2/50 px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-xs font-medium text-ink-2">
          <BarChart3 className="w-3.5 h-3.5" />
          TM Leverage Breakdown
        </div>
        <Button size="sm" variant="ghost" onClick={handleFetch} disabled={loading} className="h-7 text-xs">
          {loading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
          {row.leverage ? 'Refresh' : 'Fetch'}
        </Button>
      </div>
      {bands.length === 0 ? (
        <p className="text-xs italic-editorial text-ink-3">
          {row.leverage ? 'No breakdown data in response.' : 'Click Fetch to load the 12-band leverage.'}
        </p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {bands.map((b) => (
            <div key={b.band} className="bg-surface-1 border border-line-1 rounded px-2 py-1.5">
              <div className="text-[10px] uppercase tracking-wide text-ink-3 truncate">{b.band}</div>
              <div className="text-sm font-medium text-ink-1">{b.words != null ? Number(b.words).toLocaleString() : '—'}</div>
              {b.segments != null && <div className="text-[10px] text-ink-3">{b.segments} seg</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}