import { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, Search, Download } from 'lucide-react';
import { toast } from 'sonner';

import TaskDetailCard from '@/components/pending/TaskDetailCard';
import PendingFilters from '@/components/pending/PendingFilters';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import { fmtNumber, EM } from '@/lib/format';

const DEFAULT_FILTERS = {
  account: 'all',
  langPair: 'all',
  workflow: 'all',
  dueWindow: 'all',
  hasPrice: 'all',
  sortBy: 'due_asc',
};

// Quote every cell so commas/quotes/newlines inside values can't break the columns.
const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

function exportToCsv(tasks) {
  const headers = ['ID','Task','Account','Project','Project Code','Source','Target','Words','Min USD','Max USD','Due','Created','Workflow','Service','Type'];
  const rows = tasks.map(t => [
    t.id,
    csvCell(t.name),
    csvCell(t.account_name),
    csvCell(t.project_name),
    csvCell(t.project_code),
    csvCell(t.source_language),
    csvCell(t.target_language),
    t.word_count || 0,
    (t.price_min_usd || 0).toFixed(2),
    (t.price_max_usd || 0).toFixed(2),
    t.due_date ? new Date(t.due_date).toISOString() : '',
    t.created_at ? new Date(t.created_at).toISOString() : '',
    csvCell(t.workflow_name),
    csvCell(t.service_tag),
    csvCell(t.task_type),
  ]);
  // \r\n is the RFC 4180 line ending — Excel on Windows requires it; BOM prefix fixes UTF-8 detection.
  const csv = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `pending_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  URL.revokeObjectURL(url);
}

export default function PendingTasks() {
  const [search, setSearch] = useState('');
  const [selectedPortal, setSelectedPortal] = useState('symfonie');
  const [acceptingIds, setAcceptingIds] = useState(new Set());
  const [filters, setFilters] = useState(DEFAULT_FILTERS);

  const { data: portals = [] } = useQuery({
    queryKey: ['portals-all'],
    queryFn: () => base44.entities.Portal.list(),
  });

  const activePortal = portals.find(p => p.key === selectedPortal);
  const fetchFn = activePortal?.fetch_function || 'symfonieGetTasks';
  const acceptFn = activePortal?.accept_function || 'symfonieAcceptTask';

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['pending-tasks', selectedPortal, fetchFn],
    queryFn: async () => (await base44.functions.invoke(fetchFn, {})).data,
    staleTime: 60_000,
    retry: false,
    enabled: !!activePortal,
  });

  const tasks = data?.tasks || [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const now = Date.now();
    const dayMs = 86400000;
    const endOfToday = (() => { const d = new Date(); d.setHours(23, 59, 59, 999); return d.getTime(); })();

    const out = tasks.filter(t => {
      // Text search
      if (q) {
        const hit =
          t.name?.toLowerCase().includes(q) ||
          t.project_name?.toLowerCase().includes(q) ||
          t.account_name?.toLowerCase().includes(q) ||
          t.source_language?.toLowerCase().includes(q) ||
          t.target_language?.toLowerCase().includes(q) ||
          String(t.id).includes(q);
        if (!hit) return false;
      }
      // Account
      if (filters.account !== 'all' && t.account_name !== filters.account) return false;
      // Language pair
      if (filters.langPair !== 'all') {
        if (`${t.source_language}→${t.target_language}` !== filters.langPair) return false;
      }
      // Workflow
      if (filters.workflow !== 'all' && t.workflow_name !== filters.workflow) return false;
      // Due window
      if (filters.dueWindow !== 'all') {
        if (!t.due_date) return false;
        const due = new Date(t.due_date).getTime();
        if (filters.dueWindow === 'overdue' && due >= now) return false;
        if (filters.dueWindow === 'today' && (due < now || due > endOfToday)) return false;
        if (filters.dueWindow === '3d' && (due < now || due > now + 3 * dayMs)) return false;
        if (filters.dueWindow === '7d' && (due < now || due > now + 7 * dayMs)) return false;
      }
      // Price
      if (filters.hasPrice === 'priced' && !(t.price_max_usd > 0)) return false;
      if (filters.hasPrice === 'zero' && t.price_max_usd > 0) return false;
      return true;
    });

    // Sort
    const cmp = {
      due_asc:      (a, b) => (a.due_date ? new Date(a.due_date).getTime() : Infinity) - (b.due_date ? new Date(b.due_date).getTime() : Infinity),
      due_desc:     (a, b) => (b.due_date ? new Date(b.due_date).getTime() : -Infinity) - (a.due_date ? new Date(a.due_date).getTime() : -Infinity),
      price_desc:   (a, b) => (b.price_max_usd || 0) - (a.price_max_usd || 0),
      words_desc:   (a, b) => (b.word_count || 0) - (a.word_count || 0),
      created_desc: (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime(),
    }[filters.sortBy];
    if (cmp) out.sort(cmp);
    return out;
  }, [tasks, search, filters]);

  const activeFilterCount = useMemo(() =>
    ['account', 'langPair', 'workflow', 'dueWindow', 'hasPrice']
      .filter(k => filters[k] !== 'all').length,
    [filters]
  );

  const handleManualAccept = async (task) => {
    setAcceptingIds(prev => new Set([...prev, task.id]));
    try {
      const res = await base44.functions.invoke(acceptFn, {
        task_id: task.id, task_name: task.name, project_name: task.project_name,
        source_language: task.source_language, target_language: task.target_language,
        word_count: task.word_count, price: task.price_max_usd, due_date: task.due_date,
      });
      if (res.data?.success) { toast.success(`"${task.name}" accepted`); refetch(); }
      else toast.error(res.data?.error || 'Accept failed');
    } catch (err) { toast.error(err.message); }
    finally { setAcceptingIds(prev => { const s = new Set(prev); s.delete(task.id); return s; }); }
  };

  // Single-pass totals.
  const { totalWords, totalMaxUsd, totalMinUsd } = useMemo(() => {
    let w = 0, max = 0, min = 0;
    for (const t of tasks) {
      w += t.word_count || 0;
      max += t.price_max_usd || 0;
      min += t.price_min_usd || 0;
    }
    return { totalWords: w, totalMaxUsd: max, totalMinUsd: min };
  }, [tasks]);

  const portalOptions = useMemo(
    () => portals.filter(p => p.is_active && p.fetch_function),
    [portals]
  );

  return (
    <div className="px-8 py-7 max-w-6xl">
      <header className="flex items-end justify-between mb-7 flex-wrap gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-ink-1">Pending</h1>
          <p className="text-[13px] text-ink-3 mt-1 italic-editorial">
            Tasks waiting for acceptance, fresh from the source.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedPortal}
            onChange={(e) => { setSelectedPortal(e.target.value); setFilters(DEFAULT_FILTERS); }}
            className="h-9 px-3 rounded-md border border-line-1 bg-surface-1 text-[13px] text-ink-1 outline-none"
          >
            {portalOptions.length === 0 && <option value="symfonie">Symfonie</option>}
            {portalOptions.map(p => <option key={p.key} value={p.key}>{p.name}</option>)}
          </select>
          <button
            onClick={() => exportToCsv(filtered)}
            disabled={filtered.length === 0}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-line-1 bg-surface-1 text-[13px] text-ink-2 hover:bg-surface-2 transition-colors duration-tab disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
          <button
            onClick={() => { refetch(); }}
            disabled={isFetching}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-line-1 bg-surface-1 text-[13px] text-ink-2 hover:bg-surface-2 transition-colors duration-tab disabled:opacity-40"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </header>

      {!isLoading && !isError && tasks.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <div className="bg-surface-1 border border-line-1 rounded-md p-3.5">
            <p className="text-[10px] uppercase tracking-wider text-ink-3">Tasks</p>
            <p className="text-[22px] font-semibold tabular-nums mt-0.5 text-ink-1">{fmtNumber(tasks.length)}</p>
          </div>
          <div className="bg-surface-1 border border-line-1 rounded-md p-3.5">
            <p className="text-[10px] uppercase tracking-wider text-ink-3">Words</p>
            <p className="text-[22px] font-semibold tabular-nums mt-0.5 text-ink-1">{fmtNumber(totalWords)}</p>
          </div>
          <div className="bg-surface-1 border border-line-1 rounded-md p-3.5">
            <p className="text-[10px] uppercase tracking-wider text-ink-3">Min USD</p>
            <p className="text-[22px] font-semibold tabular-nums mt-0.5 text-ink-2">${totalMinUsd.toFixed(0)}</p>
          </div>
          <div className="bg-surface-1 border border-line-1 rounded-md p-3.5">
            <p className="text-[10px] uppercase tracking-wider text-ink-3">Max USD</p>
            <p className="text-[22px] font-semibold tabular-nums mt-0.5 text-accent">${totalMaxUsd.toFixed(0)}</p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 mb-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-3" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search task, project, account, language, ID"
            className="w-full h-9 pl-9 pr-3 rounded-md border border-line-1 bg-surface-1 text-[13px] outline-none placeholder:text-ink-4"
          />
        </div>
        {!isLoading && !isError && (
          <span className="text-[12px] text-ink-3 tabular-nums">
            {fmtNumber(filtered.length)} / {fmtNumber(tasks.length)}
          </span>
        )}
      </div>

      {!isLoading && !isError && tasks.length > 0 && (
        <PendingFilters
          tasks={tasks}
          value={filters}
          onChange={setFilters}
          onReset={() => setFilters(DEFAULT_FILTERS)}
          activeCount={activeFilterCount}
        />
      )}

      {isError ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : isLoading ? (
        <div className="space-y-2.5">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={tasks.length === 0 ? 'Nothing pending' : 'No matches'}
          body={tasks.length === 0
            ? `${activePortal?.name || 'This portal'} has no tasks in “Order” state right now — a quiet moment.`
            : 'Refine your search or clear the filter.'}
        />
      ) : (
        <div className="space-y-3">
          {filtered.map(task => (
            <TaskDetailCard
              key={task.id}
              task={task}
              accepting={acceptingIds.has(task.id)}
              onAccept={handleManualAccept}
            />
          ))}
        </div>
      )}
    </div>
  );
}