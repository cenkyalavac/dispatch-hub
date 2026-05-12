import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Play, RefreshCw, ArrowRight, ThumbsUp } from 'lucide-react';
import { toast } from 'sonner';

import Metric from '@/components/dashboard/Metric';
import AcceptanceTrend from '@/components/dashboard/charts/AcceptanceTrend';
import PortalBreakdown from '@/components/dashboard/charts/PortalBreakdown';
import LanguagePairs from '@/components/dashboard/charts/LanguagePairs';
import RulePerformance from '@/components/dashboard/charts/RulePerformance';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/ui/EmptyState';
import { fmtNumber, EM } from '@/lib/format';

export default function Dashboard() {
  const [isRunning, setIsRunning] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [selectedPortal, setSelectedPortal] = useState('all');
  const [acceptingIds, setAcceptingIds] = useState(new Set());

  const { data: portals = [], isLoading: portalsLoading } = useQuery({
    queryKey: ['portals-all'],
    queryFn: () => base44.entities.Portal.list(),
  });
  const { data: allTasks = [], refetch, isLoading: tasksLoading } = useQuery({
    queryKey: ['accepted-tasks-recent'],
    queryFn: () => base44.entities.AcceptedTask.list('-accepted_at', 500),
  });
  const { data: rules = [] } = useQuery({
    queryKey: ['rules-active'],
    queryFn: () => base44.entities.Rule.filter({ is_active: true }),
  });

  const loading = portalsLoading || tasksLoading;

  // Tek geçişte tüm türetilmiş sayıları çıkar.
  const { tasks, accepted, rejected, unsyncedCount, totalWords } = useMemo(() => {
    const scoped = selectedPortal === 'all' ? allTasks : allTasks.filter(t => t.portal === selectedPortal);
    let acc = 0, rej = 0, unsynced = 0, words = 0;
    for (const t of scoped) {
      if (t.status === 'accepted') {
        acc++;
        if (!t.sheets_synced) unsynced++;
      } else if (t.status === 'rejected') rej++;
      words += t.word_count || 0;
    }
    return { tasks: scoped, accepted: acc, rejected: rej, unsyncedCount: unsynced, totalWords: words };
  }, [allTasks, selectedPortal]);

  const connectedCount = useMemo(
    () => portals.filter(p => p.connection_status === 'connected').length,
    [portals]
  );
  const selectedPortalObj = portals.find(p => p.key === selectedPortal);

  const handleRun = async () => {
    if (selectedPortal === 'all' || !selectedPortalObj?.process_function) {
      toast.error('Pick a specific connector with a process function.');
      return;
    }
    setIsRunning(true);
    try {
      const res = await base44.functions.invoke(selectedPortalObj.process_function, {});
      const result = res.data;
      setLastResult(result);
      if (result.success) {
        toast.success(`${result.summary.accepted} accepted · ${result.summary.rejected} rejected`);
        refetch();
      } else toast.error(result.error || 'Run failed');
    } catch (err) {
      toast.error(err.message);
    } finally { setIsRunning(false); }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const res = await base44.functions.invoke('sheetsSyncPending', {});
      if (res.data?.success) { toast.success(`${res.data.synced} synced to Sheets`); refetch(); }
      else toast.error(res.data?.error || 'Sync failed');
    } catch (err) { toast.error(err.message); }
    finally { setIsSyncing(false); }
  };

  const handleManualAccept = async (task) => {
    const portal = portals.find(p => p.key === task.portal) || portals.find(p => p.key === 'symfonie');
    const acceptFn = portal?.accept_function || 'symfonieAcceptTask';
    setAcceptingIds(prev => new Set([...prev, task.id]));
    try {
      const res = await base44.functions.invoke(acceptFn, {
        task_id: task.id, task_name: task.name || task.task_name,
        project_name: task.project_name, source_language: task.source_language,
        target_language: task.target_language, word_count: task.word_count,
        price: task.price, due_date: task.due_date,
      });
      if (res.data?.success) {
        toast.success(`"${task.name || task.task_name}" accepted`);
        setLastResult(prev => prev && ({
          ...prev,
          details: { ...prev.details, skipped: prev.details.skipped.filter(s => s.id !== task.id) },
          summary: { ...prev.summary, skipped: Math.max(0, (prev.summary?.skipped || 0) - 1), accepted: (prev.summary?.accepted || 0) + 1 },
        }));
        refetch();
      } else toast.error(res.data?.error || 'Accept failed');
    } catch (err) { toast.error(err.message); }
    finally { setAcceptingIds(prev => { const s = new Set(prev); s.delete(task.id); return s; }); }
  };

  return (
    <div className="px-8 py-7 max-w-6xl">
      <header className="flex items-end justify-between mb-7 flex-wrap gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-ink-1">Overview</h1>
          <p className="text-[13px] text-ink-3 mt-1 italic-editorial">
            Trends and shapes — the story your tasks tell.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedPortal}
            onChange={(e) => setSelectedPortal(e.target.value)}
            className="h-9 px-3 rounded-md border border-line-1 bg-surface-1 text-[13px] text-ink-1 hover:bg-surface-2 transition-colors duration-tab outline-none"
          >
            <option value="all">All connectors</option>
            {portals.map(p => <option key={p.key} value={p.key}>{p.name}</option>)}
          </select>
          <button
            onClick={handleSync}
            disabled={isSyncing || unsyncedCount === 0}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-line-1 bg-surface-1 text-[13px] text-ink-2 hover:bg-surface-2 transition-colors duration-tab disabled:opacity-40"
          >
            {isSyncing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
            {unsyncedCount === 0 ? 'All synced' : `Sync ${unsyncedCount}`}
          </button>
          <button
            onClick={handleRun}
            disabled={isRunning || selectedPortal === 'all'}
            className="inline-flex items-center gap-2 h-9 px-4 rounded-md bg-accent text-white text-[13px] font-medium hover:bg-[var(--accent-hover)] transition-colors duration-tab disabled:opacity-40"
          >
            {isRunning ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            {isRunning ? 'Running' : 'Run automation'}
          </button>
        </div>
      </header>

      {/* Top metrics — quiet tiles */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        {loading ? (
          [1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-[88px]" />)
        ) : (
          <>
            <Metric label="Connectors" value={`${connectedCount}/${portals.length}`} sub="connected" />
            <Metric label="Processed" value={fmtNumber(tasks.length)} sub={selectedPortal === 'all' ? 'all' : selectedPortalObj?.name} />
            <Metric label="Accepted" value={fmtNumber(accepted)} />
            <Metric label="Rejected" value={fmtNumber(rejected)} />
            <Metric label="Words" value={fmtNumber(totalWords)} sub="processed" />
          </>
        )}
      </div>

      {/* Charts — chart-first layout */}
      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-7">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-[280px]" />)}
        </div>
      ) : tasks.length === 0 ? (
        <div className="mb-7">
          <EmptyState
            title="No data to chart yet"
            body="Run an automation or accept a pending task — charts populate as soon as activity lands."
          />
        </div>
      ) : (
        <>
          <div className="mb-4">
            <AcceptanceTrend tasks={tasks} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <PortalBreakdown tasks={tasks} portals={portals} />
            <LanguagePairs tasks={tasks} />
          </div>
          <div className="mb-7">
            <RulePerformance tasks={tasks} />
          </div>
        </>
      )}

      {/* Last run result — only shows after a run */}
      {lastResult && (
        <section className="border border-line-1 bg-surface-1 rounded-md p-5 mb-7">
          <h2 className="text-[14px] font-semibold text-ink-1">Last run</h2>
          <div className="flex flex-wrap items-center gap-5 mt-2 text-[13px]">
            <span className="text-success">✓ {lastResult.summary?.accepted || 0} accepted</span>
            <span className="text-danger">✗ {lastResult.summary?.rejected || 0} rejected</span>
            <span className="text-ink-3">∘ {lastResult.summary?.skipped || 0} skipped</span>
            {lastResult.summary?.errors > 0 && (
              <span className="text-warning">! {lastResult.summary.errors} errors</span>
            )}
          </div>
          {lastResult.details?.skipped?.filter(s => typeof s === 'object').length > 0 && (
            <div className="mt-4">
              <p className="text-[11px] uppercase tracking-wider text-ink-3 mb-2">Awaiting manual review</p>
              <div className="space-y-1 max-h-56 overflow-y-auto">
                {lastResult.details.skipped.filter(s => typeof s === 'object').map(s => (
                  <div key={s.id} className="flex items-center gap-3 px-3 py-2 rounded-md border border-line-1">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium truncate text-ink-1">{s.name || s.task_name || EM}</p>
                      <p className="text-[11px] text-ink-3 truncate">
                        {s.source_language || EM} → {s.target_language || EM}
                        {s.project_name && <span className="ml-2">· {s.project_name}</span>}
                      </p>
                    </div>
                    <button
                      onClick={() => handleManualAccept(s)}
                      disabled={acceptingIds.has(s.id)}
                      className="inline-flex items-center gap-1 h-7 px-2.5 rounded text-[11px] font-medium text-success hover:bg-success-soft transition-colors duration-tab disabled:opacity-40"
                    >
                      {acceptingIds.has(s.id) ? <RefreshCw className="w-3 h-3 animate-spin" /> : <ThumbsUp className="w-3 h-3" />}
                      Accept
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Quick links to deeper views */}
      <div className="flex items-center gap-4 text-[12px] text-ink-3">
        <Link to="/pending" className="inline-flex items-center gap-1 hover:text-ink-1 transition-colors duration-tab">
          Review pending <ArrowRight className="w-3 h-3" />
        </Link>
        <Link to="/tasks" className="inline-flex items-center gap-1 hover:text-ink-1 transition-colors duration-tab">
          Full activity <ArrowRight className="w-3 h-3" />
        </Link>
        <Link to="/portals" className="inline-flex items-center gap-1 hover:text-ink-1 transition-colors duration-tab">
          Manage connectors <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
}