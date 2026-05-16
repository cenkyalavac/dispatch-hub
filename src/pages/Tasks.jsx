import { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, XCircle, Download } from 'lucide-react';
import { format } from 'date-fns';

import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import ListToolbar, { ToolbarSelect } from '@/components/ui/ListToolbar';
import { EM, fmtNumber } from '@/lib/format';
import { downloadCsv } from '@/lib/csv';

const ACTIVITY_HEADERS = ['Status','Task','Project','Portal','Client','Source','Target','Words','Price','Due','Rule','Accepted','Sheets Synced'];
const activityRow = (t) => [
  t.status || '',
  t.task_name || '',
  t.project_name || '',
  t.portal || '',
  t.client_name || '',
  t.source_language || '',
  t.target_language || '',
  t.word_count ?? '',
  t.price ?? '',
  t.due_date ? new Date(t.due_date).toISOString() : '',
  t.matched_rule || '',
  t.accepted_at ? new Date(t.accepted_at).toISOString() : '',
  t.sheets_synced ? 'yes' : 'no',
];

export default function Tasks() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [portalFilter, setPortalFilter] = useState('all');
  const [clientFilter, setClientFilter] = useState('all');

  const { data: portals = [] } = useQuery({
    queryKey: ['portals'],
    queryFn: () => base44.entities.Portal.list(),
  });

  const { data: clients = [] } = useQuery({
    queryKey: ['clients-active'],
    queryFn: () => base44.entities.Client.filter({ is_active: true }, 'display_name', 200),
  });

  const { data: tasks = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ['accepted-tasks-all', portalFilter],
    queryFn: () =>
      portalFilter === 'all'
        ? base44.entities.AcceptedTask.list('-accepted_at', 500)
        : base44.entities.AcceptedTask.filter({ portal: portalFilter }, '-accepted_at', 500),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter(t => {
      const matchSearch = !q ||
        t.task_name?.toLowerCase().includes(q) ||
        t.project_name?.toLowerCase().includes(q) ||
        t.client_name?.toLowerCase().includes(q);
      const matchStatus = statusFilter === 'all' || t.status === statusFilter;
      const matchClient = clientFilter === 'all' || t.client_id === clientFilter;
      return matchSearch && matchStatus && matchClient;
    });
  }, [tasks, search, statusFilter, clientFilter]);

  const hasActiveFilters =
    portalFilter !== 'all' || statusFilter !== 'all' || clientFilter !== 'all' || !!search;

  const clearAll = () => {
    setSearch('');
    setPortalFilter('all');
    setStatusFilter('all');
    setClientFilter('all');
  };

  return (
    <div className="px-8 py-7 max-w-7xl">
      <header className="flex items-end justify-between mb-7 flex-wrap gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-ink-1">Activity</h1>
          <p className="text-[13px] text-ink-3 mt-1 italic-editorial">
            Complete history of accepted and rejected tasks.
          </p>
        </div>
        <button
          onClick={() => downloadCsv(`activity_${new Date().toISOString().slice(0, 10)}`, ACTIVITY_HEADERS, filtered.map(activityRow))}
          disabled={filtered.length === 0}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-line-1 bg-surface-1 text-[13px] text-ink-2 hover:bg-surface-2 transition-colors duration-tab disabled:opacity-40"
        >
          <Download className="w-3.5 h-3.5" /> CSV
        </button>
      </header>

      <ListToolbar
        search={search}
        onSearchChange={setSearch}
        placeholder="Search task, project or client"
        totalCount={tasks.length}
        filteredCount={filtered.length}
        hasActiveFilters={hasActiveFilters}
        onClear={clearAll}
        filters={
          <>
            <ToolbarSelect value={portalFilter} onChange={setPortalFilter} ariaLabel="Filter by portal">
              <option value="all">All portals</option>
              {portals.map(p => <option key={p.key} value={p.key}>{p.name}</option>)}
            </ToolbarSelect>
            {clients.length > 0 && (
              <ToolbarSelect value={clientFilter} onChange={setClientFilter} ariaLabel="Filter by client">
                <option value="all">All clients</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.display_name}</option>)}
              </ToolbarSelect>
            )}
            <ToolbarSelect value={statusFilter} onChange={setStatusFilter} ariaLabel="Filter by status">
              <option value="all">All statuses</option>
              <option value="accepted">Accepted</option>
              <option value="rejected">Rejected</option>
            </ToolbarSelect>
          </>
        }
      />

      {isLoading ? (
        <div className="space-y-1.5">
          {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-11" />)}
        </div>
      ) : isError ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={tasks.length === 0 ? 'No activity yet' : 'Nothing matches'}
          body={tasks.length === 0
            ? 'Run an automation or accept a pending task to see it logged here.'
            : 'Try a broader filter, or clear your search.'}
        />
      ) : (
        <div className="bg-surface-1 border border-line-1 rounded-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line-1 bg-surface-2 text-[11px] uppercase tracking-wider text-ink-3">
                  <th className="text-left px-4 py-2.5 font-medium w-8"></th>
                  <th className="text-left px-4 py-2.5 font-medium">Task</th>
                  <th className="text-left px-4 py-2.5 font-medium">Portal</th>
                  <th className="text-left px-4 py-2.5 font-medium">Client</th>
                  <th className="text-left px-4 py-2.5 font-medium">Pair</th>
                  <th className="text-right px-4 py-2.5 font-medium">Words</th>
                  <th className="text-left px-4 py-2.5 font-medium">Due</th>
                  <th className="text-left px-4 py-2.5 font-medium">Rule</th>
                  <th className="text-left px-4 py-2.5 font-medium">Accepted</th>
                  <th className="text-center px-4 py-2.5 font-medium">Sync</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr key={t.id} className="border-b border-line-1 last:border-0 hover:bg-surface-2 transition-colors duration-tab">
                    <td className="px-4 py-2.5">
                      {t.status === 'accepted'
                        ? <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                        : <XCircle className="w-3.5 h-3.5 text-danger" />}
                    </td>
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-ink-1 truncate max-w-[200px]">{t.task_name || EM}</p>
                      <p className="text-[11px] text-ink-3 truncate max-w-[200px]">{t.project_name || EM}</p>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[11px] uppercase tracking-wider text-ink-3">{t.portal || EM}</td>
                    <td className="px-4 py-2.5 text-ink-2">{t.client_name || EM}</td>
                    <td className="px-4 py-2.5 font-mono text-[12px] text-ink-2">
                      {t.source_language || EM} → {t.target_language || EM}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-ink-2">{fmtNumber(t.word_count)}</td>
                    <td className="px-4 py-2.5 text-[12px] text-ink-3 tabular-nums">
                      {t.due_date ? format(new Date(t.due_date), 'dd MMM yy') : EM}
                    </td>
                    <td className="px-4 py-2.5 text-ink-2 italic-editorial">{t.matched_rule || EM}</td>
                    <td className="px-4 py-2.5 text-[12px] text-ink-3 tabular-nums">
                      {t.accepted_at ? format(new Date(t.accepted_at), 'dd MMM HH:mm') : EM}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {t.sheets_synced
                        ? <span className="text-success">✓</span>
                        : <span className="text-ink-4">{EM}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}