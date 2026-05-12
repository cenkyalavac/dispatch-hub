import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Sparkles, Plus, RefreshCw, X } from 'lucide-react';
import { toast } from 'sonner';

const FIELD_LABEL = {
  source_language: 'Source lang',
  target_language: 'Target lang',
  client_name: 'Client',
};

export default function SuggestedMappings() {
  const qc = useQueryClient();
  const [dismissed, setDismissed] = useState(new Set());
  const [busyKey, setBusyKey] = useState(null);
  const [collapsed, setCollapsed] = useState(false);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['mapping-suggestions'],
    queryFn: async () => {
      const r = await base44.functions.invoke('suggestMappings', {});
      if (r.data?.error) throw new Error(r.data.error);
      return r.data;
    },
    staleTime: 60_000,
  });

  const suggestions = (data?.suggestions || []).filter(s => !dismissed.has(`${s.portal}|${s.field}|${s.value}`));

  const addOne = async (s) => {
    const key = `${s.portal}|${s.field}|${s.value}`;
    setBusyKey(key);
    try {
      // Default destination = source. User edits in MappingRow afterwards if needed.
      await base44.entities.FieldMapping.create({
        tenant_id: 'default',
        portal: s.portal,
        field: s.field,
        source_value: s.value,
        destination_value: s.value,
        is_active: true,
        notes: `Suggested from ${s.count} project${s.count === 1 ? '' : 's'}`,
      });
      qc.invalidateQueries({ queryKey: ['field-mappings'] });
      // Refetch suggestions so the new mapping disappears from the list.
      refetch();
      toast.success(`Added "${s.value}" — edit the destination if needed`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyKey(null);
    }
  };

  const dismiss = (s) => {
    setDismissed(prev => new Set([...prev, `${s.portal}|${s.field}|${s.value}`]));
  };

  if (isLoading) return null;
  if (suggestions.length === 0) return null;

  return (
    <section className="bg-accent-soft border border-accent/20 rounded-md mb-4">
      <header
        className="flex items-center gap-2 px-4 py-2.5 cursor-pointer"
        onClick={() => setCollapsed(c => !c)}
      >
        <Sparkles className="w-3.5 h-3.5 text-accent-ink" />
        <h3 className="text-[13px] font-semibold text-accent-ink">
          {suggestions.length} suggested mapping{suggestions.length === 1 ? '' : 's'}
        </h3>
        <p className="text-[12px] text-ink-3 italic-editorial">
          values seen in projects but not yet mapped
        </p>
        <button
          onClick={(e) => { e.stopPropagation(); refetch(); }}
          disabled={isFetching}
          className="ml-auto inline-flex items-center gap-1 text-[11px] text-ink-3 hover:text-ink-1 transition-colors duration-tab disabled:opacity-40"
        >
          <RefreshCw className={`w-3 h-3 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </header>
      {!collapsed && (
        <div className="px-4 pb-3 flex flex-wrap gap-2">
          {suggestions.map(s => {
            const key = `${s.portal}|${s.field}|${s.value}`;
            const busy = busyKey === key;
            return (
              <div
                key={key}
                className="inline-flex items-center gap-2 bg-surface-1 border border-line-1 rounded-md pl-2.5 pr-1 py-1"
              >
                <span className="text-[10px] uppercase tracking-wider text-ink-3">
                  {s.portal === '*' ? 'any' : s.portal}
                </span>
                <span className="text-[11px] text-ink-3">{FIELD_LABEL[s.field] || s.field}</span>
                <code className="text-[12px] font-mono text-ink-1">{s.value}</code>
                <span className="text-[10px] text-ink-3 tabular-nums">×{s.count}</span>
                <button
                  onClick={() => addOne(s)}
                  disabled={busy}
                  className="inline-flex items-center gap-1 h-6 px-2 rounded text-[11px] font-medium text-white bg-accent hover:bg-[var(--accent-hover)] transition-colors duration-tab disabled:opacity-40"
                  title="Add as mapping (source = destination)"
                >
                  {busy ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                  Add
                </button>
                <button
                  onClick={() => dismiss(s)}
                  className="inline-flex items-center justify-center w-6 h-6 rounded text-ink-3 hover:bg-surface-2 hover:text-ink-1 transition-colors duration-tab"
                  title="Dismiss"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}