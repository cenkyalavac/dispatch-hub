import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Split, Plus, Save } from 'lucide-react';
import SheetRouteRow from './SheetRouteRow';

// Conditional Sheet routes for a portal. First match wins; falls back to portal default.
// Only available after the portal has been saved (we need its key).
export default function PortalSheetRoutes({ portalKey }) {
  const qc = useQueryClient();
  const enabled = !!portalKey;

  const { data: serverRoutes = [], isLoading } = useQuery({
    queryKey: ['sheet-routes', portalKey],
    queryFn: () => base44.entities.SheetRoute.filter({ portal: portalKey }, 'priority', 100),
    enabled,
  });

  const [local, setLocal] = useState([]);
  useEffect(() => { setLocal(serverRoutes); }, [serverRoutes]);

  const dirty = JSON.stringify(local) !== JSON.stringify(serverRoutes);

  const saveAll = useMutation({
    mutationFn: async () => {
      // Diff against server state: create new, update changed, delete removed.
      const byId = new Map(serverRoutes.map(r => [r.id, r]));
      const localIds = new Set(local.map(r => r.id).filter(Boolean));

      const ops = [];
      // Deletes
      for (const r of serverRoutes) {
        if (!localIds.has(r.id)) ops.push(base44.entities.SheetRoute.delete(r.id));
      }
      // Creates + updates (priority by array order)
      for (let i = 0; i < local.length; i++) {
        const r = { ...local[i], portal: portalKey, priority: i + 1 };
        if (r.id) {
          const prev = byId.get(r.id);
          if (JSON.stringify(prev) !== JSON.stringify(r)) {
            const { id, ...patch } = r;
            ops.push(base44.entities.SheetRoute.update(id, patch));
          }
        } else {
          const { id: _omit, ...payload } = r;
          ops.push(base44.entities.SheetRoute.create(payload));
        }
      }
      await Promise.all(ops);
    },
    onSuccess: () => {
      toast.success('Sheet routes saved');
      qc.invalidateQueries({ queryKey: ['sheet-routes', portalKey] });
    },
    onError: (e) => toast.error('Save failed: ' + e.message),
  });

  if (!enabled) {
    return (
      <section className="border-t border-line-1 pt-4 mt-1">
        <div className="flex items-center gap-2 mb-1">
          <Split className="w-3.5 h-3.5 text-ink-3" />
          <h3 className="text-[13px] font-semibold text-ink-1">Conditional sheet routes</h3>
        </div>
        <p className="text-[11px] text-ink-3 italic-editorial mt-2">
          Save the connector first to start adding conditional routes.
        </p>
      </section>
    );
  }

  const addRoute = () => setLocal([...local, {
    name: 'New route', is_active: true, spreadsheet_id: '', tab_name: '', conditions: [],
  }]);
  const updateAt = (idx, next) => setLocal(local.map((r, i) => i === idx ? next : r));
  const removeAt = (idx) => setLocal(local.filter((_, i) => i !== idx));
  const moveAt = (idx, delta) => {
    const j = idx + delta;
    if (j < 0 || j >= local.length) return;
    const next = [...local];
    [next[idx], next[j]] = [next[j], next[idx]];
    setLocal(next);
  };

  return (
    <section className="border-t border-line-1 pt-4 mt-1">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Split className="w-3.5 h-3.5 text-ink-3" />
          <h3 className="text-[13px] font-semibold text-ink-1">Conditional sheet routes</h3>
          <span className="text-[11px] text-ink-3 italic-editorial">— first match wins, otherwise falls back to default</span>
        </div>
        {dirty && (
          <button
            type="button"
            onClick={() => saveAll.mutate()}
            disabled={saveAll.isPending}
            className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md bg-accent text-white text-[11px] font-medium hover:bg-[var(--accent-hover)] transition-colors duration-tab disabled:opacity-40"
          >
            <Save className="w-3 h-3" /> {saveAll.isPending ? 'Saving…' : 'Save routes'}
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="skel h-16 w-full" />
      ) : (
        <div className="space-y-2">
          {local.map((r, idx) => (
            <SheetRouteRow
              key={r.id || `new-${idx}`}
              route={r}
              onChange={(next) => updateAt(idx, next)}
              onRemove={() => removeAt(idx)}
              onMove={(d) => moveAt(idx, d)}
            />
          ))}
          <button
            type="button"
            onClick={addRoute}
            className="w-full inline-flex items-center justify-center gap-1 h-8 px-3 rounded-md border border-dashed border-line-2 text-[12px] text-ink-2 hover:bg-surface-2 transition-colors duration-tab"
          >
            <Plus className="w-3 h-3" /> Add route
          </button>
        </div>
      )}
    </section>
  );
}