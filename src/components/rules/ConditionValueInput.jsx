import { useEffect, useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { ChevronDown, Loader2, RefreshCw } from 'lucide-react';

// Data-aware value input for a single rule condition.
// - For numeric fields → renders a plain number input.
// - For text fields → fetches distinct values from getPortalFieldValues for
//   (portal, field), then renders a combobox: searchable, free-typeable.
//   Falls back to a plain text input on fetch failure.

const inputCls = 'h-8 px-2 rounded border border-line-1 bg-surface-1 text-[12px] outline-none w-full';
const numericFields = ['word_count', 'price', 'quantity'];

export default function ConditionValueInput({ portal, field, value, onChange }) {
  const isNum = numericFields.includes(field);
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [meta, setMeta] = useState(null); // { count, from_cache, fetched_at }
  const wrapRef = useRef(null);

  const load = async (force = false) => {
    if (isNum || !portal || !field) return;
    setLoading(true);
    setError(null);
    try {
      const res = await base44.functions.invoke('getPortalFieldValues', {
        portal_key: portal,
        field,
        // backend doesn't read force yet — kept for future cache-bust
        force,
      });
      const data = res?.data || {};
      setValues(Array.isArray(data.values) ? data.values : []);
      setMeta({ count: data.count, from_cache: data.from_cache, fetched_at: data.fetched_at });
    } catch (err) {
      setError(err.response?.data?.error || err.message);
      setValues([]);
    } finally {
      setLoading(false);
    }
  };

  // Refetch whenever portal or field changes.
  useEffect(() => { load(false);   }, [portal, field]);

  // Close on outside click.
  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (isNum) {
    return (
      <input
        type="number"
        className={inputCls}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="1000"
      />
    );
  }

  const q = (value || '').toLowerCase();
  const filtered = q
    ? values.filter((v) => v.toLowerCase().includes(q))
    : values;

  return (
    <div className="relative flex-1" ref={wrapRef}>
      <div className="relative">
        <input
          className={`${inputCls} pr-14`}
          value={value}
          onChange={(e) => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={loading ? 'Loading…' : (values.length ? `value (${values.length} options)` : 'value')}
        />
        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
          {loading ? (
            <Loader2 className="w-3 h-3 animate-spin text-ink-3" />
          ) : (
            <>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); load(true); }}
                className="inline-flex items-center justify-center h-5 w-5 rounded text-ink-3 hover:bg-surface-2"
                title="Refresh from portal"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="inline-flex items-center justify-center h-5 w-5 rounded text-ink-3 hover:bg-surface-2"
              >
                <ChevronDown className="w-3 h-3" />
              </button>
            </>
          )}
        </div>
      </div>

      {open && (values.length > 0 || error) && (
        <div className="absolute z-20 mt-1 w-full max-h-56 overflow-auto rounded-md border border-line-1 bg-surface-1 shadow-lg">
          {error ? (
            <div className="px-2 py-1.5 text-[11px] text-danger italic-editorial">
              Couldn't load values: {error}
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-2 py-1.5 text-[11px] text-ink-3 italic-editorial">No matches — value will be used as-is.</div>
          ) : (
            filtered.slice(0, 100).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => { onChange(v); setOpen(false); }}
                className="w-full text-left px-2 py-1 text-[12px] text-ink-1 hover:bg-accent-soft"
              >
                {v}
              </button>
            ))
          )}
          {meta && !error && (
            <div className="px-2 py-1 text-[10px] text-ink-4 border-t border-line-1">
              {meta.count} values • {meta.from_cache ? 'cached' : 'fresh'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}