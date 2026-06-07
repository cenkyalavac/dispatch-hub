import { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Play, RefreshCw, ThumbsUp, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

import TodayPanel from '@/components/dashboard/TodayPanel';
import ActionNeededPanel from '@/components/dashboard/ActionNeededPanel';
import InfraHealthPanel from '@/components/dashboard/InfraHealthPanel';
import TopListsPanel from '@/components/dashboard/TopListsPanel';
import RecentDeliveriesPanel from '@/components/dashboard/RecentDeliveriesPanel';
import WebhookTimelinePanel from '@/components/dashboard/WebhookTimelinePanel';
import { Skeleton } from '@/components/ui/skeleton';
import { EM, fmtNumber } from '@/lib/format';
import { usePendingTotals } from '@/lib/pending-totals';
import { Inbox } from 'lucide-react';

// Lean operational overview. Three focused panels:
//   1. Today — accepted / rejected / errors since local midnight
//   2. Action needed — per-connector pending preview with inline health dot
//   3. Top clients & language pairs — last 30 days
//
// "Run automation" stays on the dashboard because it's the daily-driver
// action. Everything else (charts, lifecycle bars, rule perf) was removed
// per product decision — those views live on the dedicated pages now.
export default function Dashboard() {
  const [isRunning, setIsRunning] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [selectedPortal, setSelectedPortal] = useState('all');
  const [acceptingIds, setAcceptingIds] = useState(new Set());
  // Scroll to the run result after automation finishes — it lands below the
  // panels and the user is otherwise watching the header button.
  const lastRunRef = useRef(null);

  const { data: portals = [], isLoading: portalsLoading } = useQuery({
    queryKey: ['portals-all'],
    queryFn: () => base44.entities.Portal.list(),
  });
  const { data: allTasks = [], refetch, isLoading: tasksLoading } = useQuery({
    queryKey: ['accepted-tasks-recent'],
    queryFn: () => base44.entities.AcceptedTask.list('-accepted_at', 500),
  });

  const loading = portalsLoading || tasksLoading;
  const selectedPortalObj = portals.find(p => p.key === selectedPortal);
  const pendingTotals = usePendingTotals(portals);

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
      requestAnimationFrame(() => lastRunRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
      if (result.success) {
        toast.success(`${result.summary.accepted} accepted · ${result.summary.rejected} rejected`);
        refetch();
      } else toast.error(result.error || 'Run failed');
    } catch (err) {
      toast.error(err.message);
    } finally { setIsRunning(false); }
  };

  const handleManualAccept = async (task) => {
    // Skipped tasks from a process run don't carry a `portal` field — the run
    // is portal-scoped (selectedPortalObj). Fall back to the selected portal.
    const portal = portals.find(p => p.key === task.portal) || selectedPortalObj;
    const acceptFn = portal?.accept_function;
    if (!acceptFn) {
      toast.error(`No accept function for portal "${task.portal || selectedPortal || 'unknown'}".`);
      return;
    }
    setAcceptingIds(prev => new Set([...prev, task.id]));
    try {
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
      <header className="flex items-end justify-between mb-7 flex-wrap gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-ink-1">Overview</h1>
          <p className="text-[13px] text-ink-3 mt-1 italic-editorial">
            What needs your attention right now.
          </p>
          {!pendingTotals.isLoading && pendingTotals.connectorCount > 0 && (
            <p className="mt-2 inline-flex items-center gap-1.5 text-[12px] text-ink-2 bg-surface-2 border border-line-1 rounded-md px-2.5 py-1">
              <Inbox className="w-3 h-3 text-ink-3" />
              <span className="tabular-nums font-medium">{fmtNumber(pendingTotals.total)}</span>
              <span className="text-ink-3">
                pending across {pendingTotals.connectorCount} connector{pendingTotals.connectorCount === 1 ? '' : 's'}
              </span>
            </p>
          )}
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

      <div className="space-y-4">
        {loading ? (
          <>
            <Skeleton className="h-32" />
            <Skeleton className="h-64" />
            <Skeleton className="h-48" />
          </>
        ) : (
          <>
            <TodayPanel tasks={allTasks} />
            <InfraHealthPanel portals={portals} />
            <ActionNeededPanel portals={portals} />
            {/* Two-up: shipped-this-week + recent webhooks. Side by side on
                desktop so the eye scans success (left) → integration health
                (right). Stacks on mobile. */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <RecentDeliveriesPanel />
              <WebhookTimelinePanel />
            </div>
            <TopListsPanel tasks={allTasks} />
          </>
        )}
      </div>

      {lastResult && (
        <section
          ref={lastRunRef}
          className="border border-accent/30 bg-accent-soft/40 rounded-md p-5 mt-4 animate-slide-down"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[14px] font-semibold text-ink-1 inline-flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-success" /> Last run
              <span className="font-normal text-ink-3 italic-editorial">· {selectedPortalObj?.name || ''}</span>
            </h2>
            <button
              type="button"
              onClick={() => setLastResult(null)}
              className="text-[11px] text-ink-3 hover:text-ink-1 transition-colors duration-tab"
            >
              Dismiss
            </button>
          </div>
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
    </div>
  );
}