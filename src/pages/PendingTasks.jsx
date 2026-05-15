import { useState, useMemo, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, Search, Download } from 'lucide-react';
import { toast } from 'sonner';

import TaskDetailCard from '@/components/pending/TaskDetailCard';
import PendingFilters from '@/components/pending/PendingFilters';
import BulkActionBar from '@/components/pending/BulkActionBar';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import { fmtNumber } from '@/lib/format';
import { downloadCsv } from '@/lib/csv';

// GlobalLink lives on its own page (/globallink/pending) because its data is
// entity-backed (no fetch_function). Excluding it here prevents the dropdown
// from offering a selection that would show an empty pending list.
const DEFAULT_FILTERS = {
  account: 'all',
  langPair: 'all',
  workflow: 'all',
  dueWindow: 'all',
  hasPrice: 'all',
  sortBy: 'due_asc',
};

const PENDING_HEADERS = ['ID','Task','Account','Project','Project Code','Source','Target','Words','Min USD','Max USD','Due','Created','Workflow','Service','Type'];
const pendingRow = (t) => [
  t.id ?? '',
  t.name || '',
  t.account_name || '',
  t.project_name || '',
  t.project_code || '',
  t.source_language || '',
  t.target_language || '',
  t.word_count || 0,
  (t.price_min_usd || 0).toFixed(2),
  (t.price_max_usd || 0).toFixed(2),
  t.due_date ? new Date(t.due_date).toISOString() : '',
  t.created_at ? new Date(t.created_at).toISOString() : '',
  t.workflow_name || '',
  t.service_tag || '',
  t.task_type || '',
];

export default function PendingTasks() {
  const [search, setSearch] = useState('');
  // Don't hard-code 'symfonie' — when the user later picks GlobalLink we need
  // to make sure we never fall back to symfonieGetTasks. Initialize empty and
  // let the first effect below pick the first active portal with a fetch_function.
  const [selectedPortal, setSelectedPortal] = useState('');
  const [acceptingIds, setAcceptingIds] = useState(new Set());
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  // Live progress for the sequential bulk runner so the user sees "3 of 12, 1 failed"
  // ticking forward instead of a frozen button.
  const [bulkProgress, setBulkProgress] = useState(null);

  const { data: portals = [] } = useQuery({
    queryKey: ['portals-all'],
    queryFn: () => base44.entities.Portal.list(),
  });

  const activePortal = portals.find(p => p.key === selectedPortal);
  // No silent fallback to Symfonie — if a portal is missing fetch/accept_function
  // that is a config error that should surface, not silently route to Symfonie.
  const fetchFn = activePortal?.fetch_function || null;
  const acceptFn = activePortal?.accept_function || null;
  const rejectFn = activePortal?.reject_function || null;

  // Rate-limit dostu: 5 dk cache, otomatik refetch yok, 503 olunca cache'i koru.
  // Symfonie "no available server" verince sessizce eski veriyi göster.
  // forceRefresh: set before manually clicking Refresh so the backend skips
  // its CachedSnapshot and pulls fresh from Symfonie. Reset after the call.
  const [forceRefresh, setForceRefresh] = useState(false);
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['pending-tasks', selectedPortal, fetchFn],
    queryFn: async () => {
      const res = await base44.functions.invoke(fetchFn, forceRefresh ? { force_refresh: true } : {});
      setForceRefresh(false);
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
    enabled: !!activePortal && !!fetchFn,
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
      // Due window — "today" means anything due before end-of-today (including overdue earlier in the day);
      // 3d/7d windows include the past so the user doesn't lose overdue items when narrowing the range.
      if (filters.dueWindow !== 'all') {
        if (!t.due_date) return false;
        const due = new Date(t.due_date).getTime();
        if (filters.dueWindow === 'overdue' && due >= now) return false;
        if (filters.dueWindow === 'today' && due > endOfToday) return false;
        if (filters.dueWindow === '3d' && due > now + 3 * dayMs) return false;
        if (filters.dueWindow === '7d' && due > now + 7 * dayMs) return false;
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

  // Build the payload once — used by both single and bulk paths so they stay in sync.
  const buildPayload = (task) => ({
    task_id: task.id, task_name: task.name, project_name: task.project_name,
    account_name: task.account_name || task.client_name || '',
    client_name: task.client_name || task.account_name || '',
    source_language: task.source_language, target_language: task.target_language,
    word_count: task.word_count, price: task.price_max_usd, due_date: task.due_date,
  });

  const toggleSelect = (task) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(task.id)) next.delete(task.id); else next.add(task.id);
      return next;
    });
  };

  const runBulk = async (fnName, label) => {
    if (!fnName) return;
    const targets = filtered.filter(t => selectedIds.has(t.id));
    if (targets.length === 0) return;
    setBulkBusy(true);
    setBulkProgress({ current: 0, total: targets.length, ok: 0, fail: 0 });
    // Sequential — Symfonie throttles concurrent command calls. Slow but reliable.
    let ok = 0, fail = 0;
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      try {
        const res = await base44.functions.invoke(fnName, buildPayload(t));
        if (res.data?.success) ok++; else fail++;
      } catch { fail++; }
      // Update after each item so the progress strip ticks visibly.
      setBulkProgress({ current: i + 1, total: targets.length, ok, fail });
    }
    toast[fail === 0 ? 'success' : 'warning'](`${label}: ${ok} ok${fail ? `, ${fail} failed` : ''}`);
    setSelectedIds(new Set());
    setBulkBusy(false);
    setBulkProgress(null);
    refetch();
  };

  const handleManualAccept = async (task) => {
    setAcceptingIds(prev => new Set([...prev, task.id]));
    try {
      const res = await base44.functions.invoke(acceptFn, buildPayload(task));
      if (res.data?.success) { toast.success(`"${task.name}" accepted`); refetch(); }
      else toast.error(res.data?.error || 'Accept failed');
    } catch (err) { toast.error(err.message); }
    finally { setAcceptingIds(prev => { const s = new Set(prev); s.delete(task.id); return s; }); }
  };

  // Single-pass totals — follow the active filter so the summary reflects what the user sees.
  const { totalWords, totalMaxUsd, totalMinUsd } = useMemo(() => {
    let w = 0, max = 0, min = 0;
    for (const t of filtered) {
      w += t.word_count || 0;
      max += t.price_max_usd || 0;
      min += t.price_min_usd || 0;
    }
    return { totalWords: w, totalMaxUsd: max, totalMinUsd: min };
  }, [filtered]);

  // Only portals with a real fetch_function (Symfonie, Junction). GlobalLink
  // is intentionally absent — see comment near GLOBALLINK_KEY removal above.
  const portalOptions = useMemo(
    () => portals.filter(p => p.is_active && p.fetch_function),
    [portals]
  );

  // Pick the first available portal once the list arrives — never leave the
  // user staring at an empty selector on first load. MUST run inside useEffect:
  // calling setState directly during render schedules an immediate re-render
  // and React warns ("Cannot update a component while rendering a different one").
  useEffect(() => {
    if (!selectedPortal && portalOptions.length > 0) {
      setSelectedPortal(portalOptions[0].key);
    }
  }, [selectedPortal, portalOptions]);

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
            {portalOptions.length === 0 && <option value="">No active portal</option>}
            {portalOptions.map(p => <option key={p.key} value={p.key}>{p.name}</option>)}
          </select>
          <button
            onClick={() => downloadCsv(`pending_${selectedPortal}_${new Date().toISOString().slice(0, 10)}`, PENDING_HEADERS, filtered.map(pendingRow))}
            disabled={filtered.length === 0}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-line-1 bg-surface-1 text-[13px] text-ink-2 hover:bg-surface-2 transition-colors duration-tab disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
          <button
            onClick={() => { setForceRefresh(true); refetch(); }}
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

      <BulkActionBar
        count={selectedIds.size}
        busy={bulkBusy}
        progress={bulkProgress}
        onAccept={() => runBulk(acceptFn, 'Accepted')}
        onReject={() => runBulk(rejectFn, 'Rejected')}
        onClear={() => setSelectedIds(new Set())}
        canReject={!!rejectFn}
      />

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
              selected={selectedIds.has(task.id)}
              onToggleSelect={toggleSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}