import { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, Search, Download } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import HistoryRow from '@/components/history/HistoryRow';
import { fmtNumber } from '@/lib/format';
import { downloadCsv } from '@/lib/csv';

const HISTORY_HEADERS = ['ID','Task','Project','Account','Source','Target','Workflow','State','Updated'];
const historyRow = (t) => [
  t.id ?? '',
  t.name || '',
  t.project_name || '',
  t.account_code || '',
  t.source_language || '',
  t.target_language || '',
  t.workflow_name || '',
  t.state || '',
  t.updated_at ? new Date(t.updated_at).toISOString() : '',
];

const DAY_OPTIONS = [7, 14, 30];

export default function History() {
  const [days, setDays] = useState(30);
  const [search, setSearch] = useState('');
  const [selectedPortal, setSelectedPortal] = useState('symfonie');

  // Only portals that declare a history_function show up in the picker.
  const { data: portals = [] } = useQuery({
    queryKey: ['portals-all'],
    queryFn: () => base44.entities.Portal.list(),
  });
  const historyPortals = useMemo(
    () => portals.filter(p => p.is_active && p.history_function),
    [portals],
  );

  const activePortal = portals.find(p => p.key === selectedPortal);
  const historyFn = activePortal?.history_function;

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['history', selectedPortal, historyFn, days],
    queryFn: async () => {
      const res = await base44.functions.invoke(historyFn, { days });
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: false,
    enabled: !!historyFn,
  });

  const tasks = data?.tasks || [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tasks;
    return tasks.filter(t =>
      t.name?.toLowerCase().includes(q) ||
      t.project_name?.toLowerCase().includes(q) ||
      t.account_code?.toLowerCase().includes(q) ||
      String(t.id).includes(q)
    );
  }, [tasks, search]);

  return (
    <div className="px-8 py-7 max-w-6xl">
      <header className="flex items-end justify-between mb-7 flex-wrap gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-ink-1">History</h1>
          <p className="text-[13px] text-ink-3 mt-1 italic-editorial">
            Completed & Approved tasks — read-only, not synced to sheet. Click a row for details.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedPortal}
            onChange={(e) => setSelectedPortal(e.target.value)}
            className="h-9 px-3 rounded-md border border-line-1 bg-surface-1 text-[13px] text-ink-1 outline-none"
          >
            {historyPortals.length === 0 && <option value="symfonie">Symfonie</option>}
            {historyPortals.map(p => <option key={p.key} value={p.key}>{p.name}</option>)}
          </select>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="h-9 px-3 rounded-md border border-line-1 bg-surface-1 text-[13px] text-ink-1 outline-none"
          >
            {DAY_OPTIONS.map(d => <option key={d} value={d}>Last {d} days</option>)}
          </select>
          <button
            onClick={() => downloadCsv(`history_${selectedPortal}_${days}d_${new Date().toISOString().slice(0, 10)}`, HISTORY_HEADERS, filtered.map(historyRow))}
            disabled={filtered.length === 0}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-line-1 bg-surface-1 text-[13px] text-ink-2 hover:bg-surface-2 transition-colors duration-tab disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
          <button
            onClick={() => refetch()}
            disabled={isFetching || !historyFn}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-line-1 bg-surface-1 text-[13px] text-ink-2 hover:bg-surface-2 transition-colors duration-tab disabled:opacity-40"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </header>

      <div className="flex items-center gap-3 mb-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-3" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search task, project, account"
            className="w-full h-9 pl-9 pr-3 rounded-md border border-line-1 bg-surface-1 text-[13px] outline-none placeholder:text-ink-4"
          />
        </div>
        {!isLoading && !isError && (
          <span className="text-[12px] text-ink-3 tabular-nums">
            {fmtNumber(filtered.length)} / {fmtNumber(tasks.length)}
          </span>
        )}
      </div>

      {!historyFn ? (
        <EmptyState
          title="History not available"
          body={`${activePortal?.name || 'This portal'} has no history endpoint wired up yet.`}
        />
      ) : isError ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : isLoading ? (
        <div className="space-y-2">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-14" />)}</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="Nothing in this window"
          body={tasks.length === 0
            ? `No Completed or Approved tasks in the last ${days} days.`
            : 'Refine your search.'}
        />
      ) : (
        <div className="bg-surface-1 border border-line-1 rounded-md overflow-hidden">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-surface-2 border-b border-line-1 text-[10px] uppercase tracking-wider text-ink-3">
                <th className="px-2 py-2 w-6" />
                <th className="text-left px-3 py-2 font-medium">Task</th>
                <th className="text-left px-3 py-2 font-medium">Project</th>
                <th className="text-left px-3 py-2 font-medium">Lang</th>
                <th className="text-left px-3 py-2 font-medium">Workflow</th>
                <th className="text-left px-3 py-2 font-medium">State</th>
                <th className="text-right px-3 py-2 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => <HistoryRow key={t.id} task={t} />)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}