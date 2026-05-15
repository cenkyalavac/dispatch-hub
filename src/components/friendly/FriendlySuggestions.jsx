import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Sparkles, Plus, RefreshCw, X } from 'lucide-react';
import { toast } from 'sonner';

// Sister of components/mappings/SuggestedMappings but for FriendlyName.
// Scans recent AcceptedTask + GlobalLinkSubmission rows for client/account/
// project/workflow values that have no friendly rumuz yet, ranked by frequency.

const TYPE_LABEL = {
  client: 'Client',
  account: 'Account',
  project: 'Project',
  workflow: 'Workflow',
};

export default function FriendlySuggestions() {
  const qc = useQueryClient();
  const [dismissed, setDismissed] = useState(new Set());
  const [busyKey, setBusyKey] = useState(null);
  const [collapsed, setCollapsed] = useState(false);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['friendly-suggestions'],
    queryFn: async () => {
      const r = await base44.functions.invoke('suggestFriendlyNames', {});
      if (r.data?.error) throw new Error(r.data.error);
      return r.data;
    },
    staleTime: 60_000,
  });

  const suggestions = (data?.suggestions || []).filter(
    (s) => !dismissed.has(`${s.portal}|${s.type}|${s.value}`)
  );

  const addOne = async (s) => {
    const key = `${s.portal}|${s.type}|${s.value}`;
    setBusyKey(key);
    try {
      await base44.entities.FriendlyName.create({
        portal: s.portal,
        type: s.type,
        match_by: 'name',
        source_value: s.value,
        display_name: s.value, // user edits in row afterwards
        is_active: true,
        notes: `Suggested from ${s.count} task${s.count === 1 ? '' : 's'}`,
      });
      qc.invalidateQueries({ queryKey: ['friendly-names'] });
      refetch();
      toast.success(`Added — edit the display name to shorten it`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyKey(null);
    }
  };

  const dismiss = (s) => {
    setDismissed((prev) => new Set([...prev, `${s.portal}|${s.type}|${s.value}`]));
  };

  if (isLoading) return null;
  if (suggestions.length === 0) return null;

  return (
    <section className="bg-accent-soft border border-accent/20 rounded-md mb-4">
      <header
        className="flex items-center gap-2 px-4 py-2.5 cursor-pointer"
        onClick={() => setCollapsed((c) => !c)}
      >
        <Sparkles className="w-3.5 h-3.5 text-accent-ink" />
        <h3 className="text-[13px] font-semibold text-accent-ink">
          {suggestions.length} suggested friendly name{suggestions.length === 1 ? '' : 's'}
        </h3>
        <p className="text-[12px] text-ink-3 italic-editorial">
          values seen in tasks but not yet shortened
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
          {suggestions.map((s) => {
            const key = `${s.portal}|${s.type}|${s.value}`;
            const busy = busyKey === key;
            return (
              <div
                key={key}
                className="inline-flex items-center gap-2 bg-surface-1 border border-line-1 rounded-md pl-2.5 pr-1 py-1"
              >
                <span className="text-[10px] uppercase tracking-wider text-ink-3">
                  {s.portal === '*' ? 'any' : s.portal}
                </span>
                <span className="text-[11px] text-ink-3">{TYPE_LABEL[s.type] || s.type}</span>
                <code className="text-[12px] font-mono text-ink-1 truncate max-w-[200px]" title={s.value}>{s.value}</code>
                <span className="text-[10px] text-ink-3 tabular-nums">×{s.count}</span>
                <button
                  onClick={() => addOne(s)}
                  disabled={busy}
                  className="inline-flex items-center gap-1 h-6 px-2 rounded text-[11px] font-medium text-white bg-accent hover:bg-[var(--accent-hover)] transition-colors duration-tab disabled:opacity-40"
                  title="Add — defaults display name to source, edit it after"
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