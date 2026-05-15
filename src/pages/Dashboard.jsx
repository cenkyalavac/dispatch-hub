import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Play, RefreshCw, ArrowRight, TableProperties, ThumbsUp } from 'lucide-react';
import { toast } from 'sonner';

import Metric from '@/components/dashboard/Metric';
import ConnectorRow from '@/components/dashboard/ConnectorRow';
import ActivityRow from '@/components/dashboard/ActivityRow';
import TrendChart from '@/components/dashboard/TrendChart';
import LifecycleBar from '@/components/dashboard/LifecycleBar';
import PortalShareChart from '@/components/dashboard/PortalShareChart';
import LangPairChart from '@/components/dashboard/LangPairChart';
import RulePerformance from '@/components/dashboard/RulePerformance';
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
  // Lifecycle counts come from Project entity (BMS pipeline), separate from AcceptedTask.
  const { data: allProjects = [] } = useQuery({
    queryKey: ['projects-all'],
    queryFn: () => base44.entities.Project.list('-accepted_at', 1000),
    staleTime: 30_000,
  });

  const lifecycleCounts = useMemo(() => {
    const c = { accepted: 0, synchronized: 0, delivered: 0, failed_to_sync: 0 };
    for (const p of allProjects) {
      if (c[p.state] !== undefined) c[p.state]++;
    }
    return c;
  }, [allProjects]);

  const loading = portalsLoading || tasksLoading;

  // Memoize derived counters — single pass over the (potentially 500-row) tasks list.
  const { tasks, accepted, rejected, unsyncedCount, syncedCount, taskCounts } = useMemo(() => {
    const counts = {};
    let unsynced = 0, synced = 0;
    for (const t of allTasks) {
      counts[t.portal] = (counts[t.portal] || 0) + 1;
      if (t.status === 'accepted') {
        if (t.sheets_synced) synced++; else unsynced++;
      }
    }
    const scoped = selectedPortal === 'all' ? allTasks : allTasks.filter(t => t.portal === selectedPortal);
    let acc = 0, rej = 0;
    for (const t of scoped) {
      if (t.status === 'accepted') acc++;
      else if (t.status === 'rejected') rej++;
    }
    return { tasks: scoped, accepted: acc, rejected: rej, unsyncedCount: unsynced, syncedCount: synced, taskCounts: counts };
  }, [allTasks, selectedPortal]);

  const connectedCount = useMemo(
    () => portals.filter(p => p.connection_status === 'connected').length,
    [portals]
  );
  const activePortalsCount = useMemo(() => portals.filter(p => p.is_active).length, [portals]);
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
    // Skipped tasks from a process run don't carry a `portal` field — the run
    // is portal-scoped (selectedPortalObj). Fall back to the selected portal
    // when the task itself is unlabeled. Never silently default to Symfonie.
    const portal = portals.find(p => p.key === task.portal) || selectedPortalObj;
    const acceptFn = portal?.accept_function;
    if (!acceptFn) {
      toast.error(`No accept function for portal "${task.portal || selectedPortal || 'unknown'}".`);
      return;
    }
    setAcceptingIds(prev => new Set([...prev, task.id]));
    try {
      // symfonieAcceptTask expects `account_name`; junctionAcceptOffer accepts both. Send both so
      // either function gets the client name regardless of which portal the task came from.
      const res = await base44.functions.invoke(acceptFn, {
        task_id: task.id, task_name: task.name || task.task_name,
        project_name: task.project_name,
        account_name: task.account_name || task.client_name || '',
        client_name: task.client_name || task.account_name || '',
        source_language: task.source_language,
        target_language: task.target_language, word_count: task.word_count,
        price: task.price, due_date: task.due_date,
      });
      if (res.data?.success) {
        toast.success(`"${task.name || task.task_name}" accepted`);
        setLastResult(prev => {
          if (!prev) return prev;
          const skipped = prev.details?.skipped || [];
          return {
            ...prev,
            details: { ...(prev.details || {}), skipped: skipped.filter(s => s.id !== task.id) },
            summary: {
              ...(prev.summary || {}),
              skipped: Math.max(0, (prev.summary?.skipped || 0) - 1),
              accepted: (prev.summary?.accepted || 0) + 1,
            },
          };
        });
        refetch();
      } else toast.error(res.data?.error || 'Accept failed');
    } catch (err) { toast.error(err.message); }
    finally { setAcceptingIds(prev => { const s = new Set(prev); s.delete(task.id); return s; }); }
  };

  return (
    <div className="px-8 py-7 max-w-6xl">
      {/* Header */}
      <header className="flex items-end justify-between mb-7 flex-wrap gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-ink-1">Overview</h1>
          <p className="text-[13px] text-ink-3 mt-1 italic-editorial">
            One screen for every portal, every rule, every accepted task.
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
            onClick={handleRun}
            disabled={isRunning || selectedPortal === 'all'}
            className="inline-flex items-center gap-2 h-9 px-4 rounded-md bg-accent text-white text-[13px] font-medium hover:bg-[var(--accent-hover)] transition-colors duration-tab disabled:opacity-40"
          >
            {isRunning ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            {isRunning ? 'Running' : 'Run automation'}
          </button>
        </div>
      </header>

      {/* Metrics — 5 quiet tiles, 0 accent emphasis */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-7">
        {loading ? (
          [1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-[88px]" />)
        ) : (
          <>
            <Metric label="Connectors" value={`${connectedCount}/${portals.length}`} sub={`${activePortalsCount} active`} />
            <Metric label="Processed" value={fmtNumber(tasks.length)} sub={selectedPortal === 'all' ? 'all' : selectedPortalObj?.name} />
            <Metric label="Accepted" value={fmtNumber(accepted)} />
            <Metric label="Rejected" value={fmtNumber(rejected)} />
            <Metric label="Rules" value={fmtNumber(rules.length)} sub="active" />
          </>
        )}
      </div>

      {/* Two-column: Sync action + Connectors list */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-7">
        {/* Sheets sync — single accent spot */}
        <section className="bg-surface-1 border border-line-1 rounded-md p-5">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h2 className="text-[14px] font-semibold text-ink-1">Sheets sync</h2>
              <p className="text-[12px] text-ink-3 italic-editorial mt-0.5">Every five minutes, and on accept.</p>
            </div>
            <TableProperties className="w-4 h-4 text-ink-3" />
          </div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-ink-3">Pending</p>
              <p className="text-[22px] font-semibold tabular-nums mt-0.5 text-ink-1">{fmtNumber(unsyncedCount)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-ink-3">Synced</p>
              <p className="text-[22px] font-semibold tabular-nums mt-0.5 text-ink-1">
                {fmtNumber(syncedCount)}
              </p>
            </div>
          </div>
          <button
            onClick={handleSync}
            disabled={isSyncing || unsyncedCount === 0}
            className="w-full h-8 rounded-md border border-line-1 text-[12px] font-medium text-ink-2 hover:bg-surface-2 transition-colors duration-tab disabled:opacity-40 inline-flex items-center justify-center gap-1.5"
          >
            {isSyncing ? <RefreshCw className="w-3 h-3 animate-spin" /> : null}
            {unsyncedCount === 0 ? 'Nothing to sync' : `Sync ${unsyncedCount} now`}
          </button>
        </section>

        {/* Connectors */}
        <section className="lg:col-span-2 bg-surface-1 border border-line-1 rounded-md">
          <header className="flex items-center justify-between px-5 py-3 border-b border-line-1">
            <h2 className="text-[14px] font-semibold text-ink-1">Connectors</h2>
            <Link to="/portals" className="inline-flex items-center gap-1 text-[12px] text-ink-3 hover:text-ink-1 transition-colors duration-tab">
              Manage <ArrowRight className="w-3 h-3" />
            </Link>
          </header>
          <div className="p-2">
            {loading ? [1, 2].map(i => <Skeleton key={i} className="h-12 mx-1 my-1" />) :
              portals.length === 0 ? (
                <div className="p-6 text-center text-[13px] text-ink-3 italic-editorial">No connectors registered yet.</div>
              ) : portals.map(p => (
                <ConnectorRow key={p.id} portal={p} processedCount={taskCounts[p.key] || 0} />
              ))
            }
          </div>
        </section>
      </div>

      {/* BMS pipeline lifecycle — accept → sync → deliver, with failures called out. */}
      <section className="bg-surface-1 border border-line-1 rounded-md p-5 mb-7">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-[14px] font-semibold text-ink-1">BMS pipeline</h2>
            <p className="text-[12px] text-ink-3 italic-editorial mt-0.5">
              Where every accepted project sits in the handoff to your downstream system.
            </p>
          </div>
        </div>
        {loading ? <Skeleton className="h-24" /> : <LifecycleBar counts={lifecycleCounts} />}
      </section>

      {/* Analytics — 4 panels: trend / portal share / lang pairs / rule perf */}
      {!loading && allTasks.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-7">
          <section className="bg-surface-1 border border-line-1 rounded-md p-5 lg:col-span-2">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-[14px] font-semibold text-ink-1">Last 14 days</h2>
              <div className="flex items-center gap-3 text-[11px] text-ink-3">
                <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-accent" /> Accepted</span>
                <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-danger" /> Rejected</span>
              </div>
            </div>
            <TrendChart tasks={tasks} days={14} />
          </section>

          <section className="bg-surface-1 border border-line-1 rounded-md p-5">
            <h2 className="text-[14px] font-semibold text-ink-1 mb-3">Portal share</h2>
            <PortalShareChart tasks={tasks} portals={portals} />
          </section>

          <section className="bg-surface-1 border border-line-1 rounded-md p-5">
            <h2 className="text-[14px] font-semibold text-ink-1 mb-3">Top language pairs</h2>
            <LangPairChart tasks={tasks} />
          </section>

          <section className="bg-surface-1 border border-line-1 rounded-md p-5 lg:col-span-2">
            <h2 className="text-[14px] font-semibold text-ink-1 mb-3">Rule performance</h2>
            <RulePerformance tasks={tasks} rules={rules} />
          </section>
        </div>
      )}

      {/* Last run result */}
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

      {/* Activity */}
      <section className="bg-surface-1 border border-line-1 rounded-md">
        <header className="flex items-center justify-between px-5 py-3 border-b border-line-1">
          <h2 className="text-[14px] font-semibold text-ink-1">Recent activity</h2>
          <Link to="/tasks" className="inline-flex items-center gap-1 text-[12px] text-ink-3 hover:text-ink-1 transition-colors duration-tab">
            View all <ArrowRight className="w-3 h-3" />
          </Link>
        </header>
        <div className="p-2">
          {loading ? (
            <div className="space-y-1 p-1">
              {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-12" />)}
            </div>
          ) : tasks.length === 0 ? (
            <div className="px-2 py-2">
              <EmptyState
                title="Nothing processed yet"
                body="When the automation runs, accepted and rejected tasks land here for review."
              />
            </div>
          ) : (
            tasks.slice(0, 10).map(t => <ActivityRow key={t.id} task={t} />)
          )}
        </div>
      </section>
    </div>
  );
}