import { Search, X } from 'lucide-react';
import { fmtNumber } from '@/lib/format';

/**
 * Unified search + filter toolbar for list pages (Activity, History, etc).
 * Composition over configuration: pass `filters` as a child slot so each page
 * keeps full control over its select options, while sharing the layout,
 * search input, result counter, and clear-all behavior.
 *
 * Layout: [Search input ……] [filter slot] [counter] [clear?]
 * On narrow screens the row wraps; counter and clear stay together on the right.
 */
export default function ListToolbar({
  search,
  onSearchChange,
  placeholder = 'Search…',
  filters,
  totalCount,
  filteredCount,
  hasActiveFilters = false,
  onClear,
}) {
  const showCounter = typeof totalCount === 'number';
  const filteredOut = showCounter && filteredCount !== totalCount;

  return (
    <div className="flex items-center gap-2 flex-wrap mb-5">
      <div className="relative flex-1 min-w-[220px] max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-3" />
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={placeholder}
          className="w-full h-9 pl-9 pr-3 rounded-md border border-line-1 bg-surface-1 text-[13px] outline-none placeholder:text-ink-4 focus:border-accent transition-colors duration-tab"
        />
        {search && (
          <button
            onClick={() => onSearchChange('')}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 inline-flex items-center justify-center rounded text-ink-3 hover:text-ink-1 hover:bg-surface-2 transition-colors duration-tab"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {filters && <div className="flex items-center gap-2 flex-wrap">{filters}</div>}

      <div className="ml-auto flex items-center gap-2">
        {showCounter && (
          <span className="text-[12px] text-ink-3 tabular-nums">
            {filteredOut
              ? <><span className="text-ink-1 font-medium">{fmtNumber(filteredCount)}</span> of {fmtNumber(totalCount)}</>
              : <>{fmtNumber(totalCount)}</>}
          </span>
        )}
        {hasActiveFilters && onClear && (
          <button
            onClick={onClear}
            className="inline-flex items-center gap-1 h-7 px-2 rounded-md text-[12px] text-ink-3 hover:bg-surface-2 hover:text-ink-1 transition-colors duration-tab"
          >
            <X className="w-3 h-3" /> Clear
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Shared compact select styled to match ListToolbar inputs.
 * Avoids each consuming page duplicating the same className soup.
 */
export function ToolbarSelect({ value, onChange, children, ariaLabel }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
      className="h-9 px-3 pr-8 rounded-md border border-line-1 bg-surface-1 text-[13px] text-ink-1 outline-none hover:bg-surface-2 focus:border-accent transition-colors duration-tab cursor-pointer"
    >
      {children}
    </select>
  );
}