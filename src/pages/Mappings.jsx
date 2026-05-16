import { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftRight, AlertTriangle, MinusCircle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

import MappingForm from '@/components/mappings/MappingForm';
import MappingGroup from '@/components/mappings/MappingGroup';
import SuggestedMappings from '@/components/mappings/SuggestedMappings';
import EmptyState from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import ListToolbar, { ToolbarSelect } from '@/components/ui/ListToolbar';
import { findConflictIds, isIdentityMapping, groupByField } from '@/lib/mapping-analysis';

const FIELD_ORDER = ['source_language', 'target_language', 'client_name', 'workflow_name', 'service_tag'];

// Tiny pill used in the health summary strip.
function HealthPill({ icon: Icon, tone, label, count }) {
  const TONES = {
    good:    'bg-success-soft text-success',
    warning: 'bg-warning-soft text-warning',
    neutral: 'bg-surface-2 text-ink-3',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded ${TONES[tone]}`}>
      <Icon className="w-3 h-3" />
      <span className="tabular-nums font-medium">{count}</span>
      <span className="opacity-80">{label}</span>
    </span>
  );
}

export default function Mappings() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [filterField, setFilterField] = useState('all');
  const [filterPortal, setFilterPortal] = useState('all');

  const { data: portals = [] } = useQuery({
    queryKey: ['portals-all'],
    queryFn: () => base44.entities.Portal.list(),
  });

  const { data: mappings = [], isLoading } = useQuery({
    queryKey: ['field-mappings'],
    queryFn: () => base44.entities.FieldMapping.list('-created_date', 500),
  });

  // Conflicts and identity flags are computed against the FULL set — not the
  // filtered view — so the badges remain meaningful regardless of the search.
  const conflictIds = useMemo(() => findConflictIds(mappings), [mappings]);
  const identityCount = useMemo(
    () => mappings.filter(m => m.is_active && isIdentityMapping(m)).length,
    [mappings],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return mappings.filter(m => {
      if (filterField !== 'all' && m.field !== filterField) return false;
      if (filterPortal !== 'all' && m.portal !== filterPortal) return false;
      if (!q) return true;
      return (
        m.source_value?.toLowerCase().includes(q) ||
        m.destination_value?.toLowerCase().includes(q) ||
        m.portal?.toLowerCase().includes(q) ||
        m.notes?.toLowerCase().includes(q)
      );
    });
  }, [mappings, search, filterField, filterPortal]);

  const grouped = useMemo(() => groupByField(filtered, FIELD_ORDER), [filtered]);

  const hasActiveFilters = !!search || filterField !== 'all' || filterPortal !== 'all';
  const clearAll = () => { setSearch(''); setFilterField('all'); setFilterPortal('all'); };

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

  const rowHandlers = { onToggle: toggleMapping, onDelete: deleteMapping, onSave: saveMapping };
  const activeCount = mappings.filter(m => m.is_active).length;

  return (
    <div className="px-8 py-7 max-w-5xl">
      <header className="mb-5">
        <h1 className="text-[22px] font-semibold tracking-tight text-ink-1 flex items-center gap-2">
          <ArrowLeftRight className="w-5 h-5 text-ink-3" /> Field mappings
        </h1>
        <p className="text-[13px] text-ink-3 mt-1 italic-editorial">
          Translate portal values into the language your BMS speaks. Case-insensitive; unmatched values pass through unchanged.
        </p>
      </header>

      {/* Health summary — the at-a-glance "is my mapping table healthy?" answer. */}
      {mappings.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap mb-5">
          <HealthPill icon={CheckCircle2} tone="good" label="active" count={activeCount} />
          {conflictIds.size > 0 && (
            <HealthPill icon={AlertTriangle} tone="warning" label="in conflict" count={conflictIds.size} />
          )}
          {identityCount > 0 && (
            <HealthPill icon={MinusCircle} tone="neutral" label="no-op (source = destination)" count={identityCount} />
          )}
        </div>
      )}

      <SuggestedMappings />

      <MappingForm portals={portals.filter(p => p.is_active)} onSubmit={createMapping} />

      <ListToolbar
        search={search}
        onSearchChange={setSearch}
        placeholder="Search source, destination, portal, notes"
        totalCount={mappings.length}
        filteredCount={filtered.length}
        hasActiveFilters={hasActiveFilters}
        onClear={clearAll}
        filters={
          <>
            <ToolbarSelect value={filterPortal} onChange={setFilterPortal} ariaLabel="Filter by portal">
              <option value="all">All portals</option>
              <option value="*">Any (wildcard)</option>
              {portals.map(p => <option key={p.key} value={p.key}>{p.name}</option>)}
            </ToolbarSelect>
            <ToolbarSelect value={filterField} onChange={setFilterField} ariaLabel="Filter by field">
              <option value="all">All fields</option>
              <option value="source_language">Source language</option>
              <option value="target_language">Target language</option>
              <option value="client_name">Client name</option>
              <option value="workflow_name">Workflow</option>
              <option value="service_tag">Service tag</option>
            </ToolbarSelect>
          </>
        }
      />

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
        <div>
          {grouped.map(([field, rows]) => (
            <MappingGroup
              key={field}
              field={field}
              mappings={rows}
              conflictIds={conflictIds}
              {...rowHandlers}
            />
          ))}
        </div>
      )}
    </div>
  );
}