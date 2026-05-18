// Compact filter bar above the GlobalLink pending table. Two inputs only —
// keep it minimal; sorting is on the column headers and column-visibility
// can come later if the user asks for it.
//
// Filters are PURELY client-side (operates on the already-fetched rows). The
// fetch query itself is unchanged — refreshing still pulls everything.

import { Search, X } from 'lucide-react';

export default function GlobalLinkPendingFilters({
  clientQuery,
  onClientQueryChange,
  targetLang,
  onTargetLangChange,
  targetLangOptions,
  resultCount,
  totalCount,
}) {
  const isFiltered = clientQuery.trim() !== '' || targetLang !== 'all';
  const clear = () => {
    onClientQueryChange('');
    onTargetLangChange('all');
  };

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-line-1 bg-surface-2/40 flex-wrap">
      <div className="relative flex-1 min-w-[180px] max-w-[260px]">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-ink-4" />
        <input
          value={clientQuery}
          onChange={(e) => onClientQueryChange(e.target.value)}
          placeholder="Filter client or submission…"
          className="w-full h-7 pl-7 pr-2 rounded-md bg-surface-1 border border-line-1 text-[12px] text-ink-1 placeholder:text-ink-4 focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent"
        />
      </div>

      <select
        value={targetLang}
        onChange={(e) => onTargetLangChange(e.target.value)}
        className="h-7 px-2 rounded-md bg-surface-1 border border-line-1 text-[12px] text-ink-1 focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent"
      >
        <option value="all">All targets</option>
        {targetLangOptions.map((lang) => (
          <option key={lang} value={lang}>{lang}</option>
        ))}
      </select>

      {isFiltered && (
        <button
          onClick={clear}
          className="inline-flex items-center gap-1 h-7 px-2 rounded text-[11px] text-ink-3 hover:bg-surface-2 hover:text-ink-1 transition-colors duration-tab"
        >
          <X className="w-3 h-3" /> Clear
        </button>
      )}

      <span className="ml-auto text-[11px] text-ink-3 tabular-nums">
        {isFiltered ? `${resultCount} of ${totalCount}` : `${totalCount}`}
      </span>
    </div>
  );
}