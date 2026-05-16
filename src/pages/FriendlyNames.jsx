import { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Tag, Search } from 'lucide-react';
import { toast } from 'sonner';

import FriendlyNameForm from '@/components/friendly/FriendlyNameForm';
import FriendlyNameRow from '@/components/friendly/FriendlyNameRow';
import FriendlySuggestions from '@/components/friendly/FriendlySuggestions';
import EmptyState from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';

export default function FriendlyNames() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');

  const { data: portals = [] } = useQuery({
    queryKey: ['portals-all'],
    queryFn: () => base44.entities.Portal.list(),
  });

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['friendly-names'],
    queryFn: () => base44.entities.FriendlyName.list('-created_date', 1000),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (filterType !== 'all' && it.type !== filterType) return false;
      if (!q) return true;
      return (
        it.source_value?.toLowerCase().includes(q) ||
        it.display_name?.toLowerCase().includes(q) ||
        it.portal?.toLowerCase().includes(q) ||
        it.notes?.toLowerCase().includes(q)
      );
    });
  }, [items, search, filterType]);

  const createItem = async (data) => {
    await base44.entities.FriendlyName.create({ is_active: true, ...data });
    qc.invalidateQueries({ queryKey: ['friendly-names'] });
    toast.success('Friendly name added');
  };

  const toggleItem = async (it) => {
    await base44.entities.FriendlyName.update(it.id, { is_active: !it.is_active });
    qc.invalidateQueries({ queryKey: ['friendly-names'] });
  };

  const deleteItem = async (it) => {
    if (!confirm(`Delete "${it.source_value} → ${it.display_name}"?`)) return;
    await base44.entities.FriendlyName.delete(it.id);
    qc.invalidateQueries({ queryKey: ['friendly-names'] });
    toast.success('Friendly name deleted');
  };

  const saveItem = async (it, patch) => {
    await base44.entities.FriendlyName.update(it.id, patch);
    qc.invalidateQueries({ queryKey: ['friendly-names'] });
    toast.success('Friendly name updated');
  };

  const input = 'h-9 px-3 rounded-md border border-line-1 bg-surface-1 text-[13px] outline-none placeholder:text-ink-4';

  return (
    <div className="px-8 py-7 max-w-5xl">
      <header className="mb-7">
        <h1 className="text-[22px] font-semibold tracking-tight text-ink-1 flex items-center gap-2">
          <Tag className="w-5 h-5 text-ink-3" /> Friendly names
        </h1>
        <p className="text-[13px] text-ink-3 mt-1 italic-editorial">
          Short, readable rumuz for portal clients, accounts, projects, and workflows.
          Used in the UI, notification emails, Google Sheets, and the BMS API.
          Unmatched values fall through unchanged — nothing breaks if you skip one.
        </p>
      </header>

      <FriendlySuggestions />

      <FriendlyNameForm portals={portals.filter((p) => p.is_active)} onSubmit={createItem} />

      <div className="flex items-center gap-3 mb-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-3" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search source, display, portal, notes"
            className={`${input} w-full pl-9`}
          />
        </div>
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className={input}>
          <option value="all">All types</option>
          <option value="client">Client</option>
          <option value="account">Account</option>
          <option value="project">Project</option>
          <option value="workflow">Workflow</option>
        </select>
        <span className="text-[12px] text-ink-3 tabular-nums">{filtered.length} / {items.length}</span>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={items.length === 0 ? 'No friendly names yet' : 'No matches'}
          body={items.length === 0
            ? 'Add a rumuz above so verbose upstream names get short, readable display labels everywhere.'
            : 'Adjust your search or type filter.'}
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((it) => (
            <FriendlyNameRow key={it.id} item={it} onToggle={toggleItem} onDelete={deleteItem} onSave={saveItem} />
          ))}
        </div>
      )}
    </div>
  );
}