import { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import ConditionValueInput from '@/components/rules/ConditionValueInput';
import MappingRow from '@/components/mappings/MappingRow';
import EmptyState from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { getFieldsForPortal } from '@/lib/portal-fields';

// Portal-scoped mappings. Lists rows where portal === portal.key OR portal === '*'.
// New mappings created here are always scoped to portal.key (use the global
// /mappings page to create cross-portal '*' mappings).

const input = 'h-9 px-3 rounded-md border border-line-1 bg-surface-1 text-[13px] outline-none placeholder:text-ink-4';

// Subset of fields that are mapping-eligible. We intentionally only allow
// fields where mapping makes semantic sense (translating one string to another).
const MAPPING_FIELD_NAMES = new Set([
  'source_language', 'target_language', 'client_name', 'workflow_name', 'service_tag',
]);

export default function MappingsTab({ portal }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');

  const portalFields = getFieldsForPortal(portal);
  // Only string fields that are in the mapping-eligible whitelist.
  const fields = portalFields.filter((f) => f.type !== 'number' && MAPPING_FIELD_NAMES.has(f.name));

  const [form, setForm] = useState({
    field: fields[0]?.name || 'source_language',
    source_value: '',
    destination_value: '',
    notes: '',
  });

  const { data: mappings = [], isLoading } = useQuery({
    queryKey: ['field-mappings-portal', portal.key],
    // Server doesn't support OR — fetch both buckets in parallel.
    queryFn: async () => {
      const [own, any] = await Promise.all([
        base44.entities.FieldMapping.filter({ portal: portal.key }, '-created_date', 500),
        base44.entities.FieldMapping.filter({ portal: '*' }, '-created_date', 500),
      ]);
      return [...own, ...any];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return mappings;
    return mappings.filter((m) =>
      m.source_value?.toLowerCase().includes(q) ||
      m.destination_value?.toLowerCase().includes(q) ||
      m.notes?.toLowerCase().includes(q)
    );
  }, [mappings, search]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['field-mappings-portal', portal.key] });
    qc.invalidateQueries({ queryKey: ['field-mappings'] });
  };

  const create = async (e) => {
    e.preventDefault();
    if (!form.source_value.trim() || !form.destination_value.trim()) return;
    await base44.entities.FieldMapping.create({
      tenant_id: 'default',
      is_active: true,
      portal: portal.key,
      field: form.field,
      source_value: form.source_value.trim(),
      destination_value: form.destination_value.trim(),
      notes: form.notes || '',
    });
    setForm({ ...form, source_value: '', destination_value: '', notes: '' });
    invalidate();
    toast.success('Mapping added');
  };

  const toggle = async (m) => {
    await base44.entities.FieldMapping.update(m.id, { is_active: !m.is_active });
    invalidate();
  };

  const remove = async (m) => {
    if (!confirm(`Delete mapping "${m.source_value} → ${m.destination_value}"?`)) return;
    await base44.entities.FieldMapping.delete(m.id);
    invalidate();
    toast.success('Mapping deleted');
  };

  return (
    <div>
      <p className="text-[13px] text-ink-3 italic-editorial mb-4">
        Translate {portal.name} values into the language your BMS speaks. Case-insensitive; unmatched values pass through unchanged.
      </p>

      <form onSubmit={create} className="bg-surface-2 border border-line-1 rounded-md p-4 mb-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <select
            value={form.field}
            onChange={(e) => setForm({ ...form, field: e.target.value })}
            className={input}
          >
            {fields.length === 0 ? (
              <option value="">No mappable fields</option>
            ) : fields.map((f) => <option key={f.name} value={f.name}>{f.label}</option>)}
          </select>
          <div className="self-center">
            <ConditionValueInput
              portal={portal.key}
              field={form.field}
              value={form.source_value}
              onChange={(v) => setForm({ ...form, source_value: v })}
            />
          </div>
          <input
            value={form.destination_value}
            onChange={(e) => setForm({ ...form, destination_value: e.target.value })}
            placeholder="To (e.g. EN)"
            className={input}
          />
          <input
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="Notes (optional)"
            className={input}
          />
          <button
            type="submit"
            disabled={fields.length === 0}
            className="inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-md bg-accent text-white text-[13px] font-medium hover:bg-[var(--accent-hover)] transition-colors duration-tab disabled:opacity-40"
          >
            <Plus className="w-3.5 h-3.5" /> Add
          </button>
        </div>
      </form>

      <div className="flex items-center gap-3 mb-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-3" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search source, destination, notes"
            className={`${input} w-full pl-9`}
          />
        </div>
        <span className="text-[12px] text-ink-3 tabular-nums">{filtered.length} / {mappings.length}</span>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={mappings.length === 0 ? 'No mappings yet' : 'No matches'}
          body={mappings.length === 0
            ? `Add a mapping above to translate ${portal.name} values to your BMS vocabulary.`
            : 'Adjust your search.'}
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((m) => (
            <MappingRow key={m.id} mapping={m} onToggle={toggle} onDelete={remove} />
          ))}
        </div>
      )}
    </div>
  );
}