import { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftRight, Search } from 'lucide-react';
import { toast } from 'sonner';

import MappingForm from '@/components/mappings/MappingForm';
import MappingRow from '@/components/mappings/MappingRow';
import SuggestedMappings from '@/components/mappings/SuggestedMappings';
import EmptyState from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';

export default function Mappings() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [filterField, setFilterField] = useState('all');

  const { data: portals = [] } = useQuery({
    queryKey: ['portals-all'],
    queryFn: () => base44.entities.Portal.list(),
  });

  const { data: mappings = [], isLoading } = useQuery({
    queryKey: ['field-mappings'],
    queryFn: () => base44.entities.FieldMapping.list('-created_date', 500),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return mappings.filter(m => {
      if (filterField !== 'all' && m.field !== filterField) return false;
      if (!q) return true;
      return (
        m.source_value?.toLowerCase().includes(q) ||
        m.destination_value?.toLowerCase().includes(q) ||
        m.portal?.toLowerCase().includes(q) ||
        m.notes?.toLowerCase().includes(q)
      );
    });
  }, [mappings, search, filterField]);

  const createMapping = async (data) => {
    await base44.entities.FieldMapping.create({ tenant_id: 'default', is_active: true, ...data });
    qc.invalidateQueries({ queryKey: ['field-mappings'] });
    toast.success('Mapping added');
  };

  const toggleMapping = async (m) => {
    await base44.entities.FieldMapping.update(m.id, { is_active: !m.is_active });
    qc.invalidateQueries({ queryKey: ['field-mappings'] });
  };

  const deleteMapping = async (m) => {
    if (!confirm(`Delete mapping "${m.source_value} → ${m.destination_value}"?`)) return;
    await base44.entities.FieldMapping.delete(m.id);
    qc.invalidateQueries({ queryKey: ['field-mappings'] });
    toast.success('Mapping deleted');
  };

  const saveMapping = async (m, patch) => {
    await base44.entities.FieldMapping.update(m.id, patch);
    qc.invalidateQueries({ queryKey: ['field-mappings'] });
    toast.success('Mapping updated');
  };

  const input = 'h-9 px-3 rounded-md border border-line-1 bg-surface-1 text-[13px] outline-none placeholder:text-ink-4';

  return (
    <div className="px-8 py-7 max-w-5xl">
      <header className="mb-7">
        <h1 className="text-[22px] font-semibold tracking-tight text-ink-1 flex items-center gap-2">
          <ArrowLeftRight className="w-5 h-5 text-ink-3" /> Field mappings
        </h1>
        <p className="text-[13px] text-ink-3 mt-1 italic-editorial">
          Translate portal values into the language your BMS speaks. Case-insensitive; unmatched values pass through unchanged.
        </p>
      </header>

      <SuggestedMappings />

      <MappingForm portals={portals.filter(p => p.is_active)} onSubmit={createMapping} />

      <div className="flex items-center gap-3 mb-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-3" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search source, destination, portal, notes"
            className={`${input} w-full pl-9`}
          />
        </div>
        <select value={filterField} onChange={(e) => setFilterField(e.target.value)} className={input}>
          <option value="all">All fields</option>
          <option value="source_language">Source language</option>
          <option value="target_language">Target language</option>
          <option value="client_name">Client name</option>
          <option value="workflow_name">Workflow</option>
          <option value="service_tag">Service tag</option>
        </select>
        <span className="text-[12px] text-ink-3 tabular-nums">{filtered.length} / {mappings.length}</span>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12" />)}</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={mappings.length === 0 ? 'No mappings yet' : 'No matches'}
          body={mappings.length === 0
            ? 'Add a rule above to translate language codes, client names, or workflow tags as projects flow to your BMS.'
            : 'Adjust your search or field filter.'}
        />
      ) : (
        <div className="space-y-2">
          {filtered.map(m => (
            <MappingRow key={m.id} mapping={m} onToggle={toggleMapping} onDelete={deleteMapping} onSave={saveMapping} />
          ))}
        </div>
      )}
    </div>
  );
}