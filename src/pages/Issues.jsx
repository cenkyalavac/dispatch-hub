import { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Search, AlertTriangle, AlertCircle, History } from 'lucide-react';
import { toast } from 'sonner';

import IssueRow from '@/components/issues/IssueRow';
import SystemIssuesTable from '@/components/issues/SystemIssuesTable';
import BulkActionBar from '@/components/pending/BulkActionBar';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import { fmtNumber } from '@/lib/format';

export default function Issues() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [portalFilter, setPortalFilter] = useState('all');
  const [resettingIds, setResettingIds] = useState(new Set());
  const [resolvingIds, setResolvingIds] = useState(new Set());
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  // System issue table — multi-select for bulk resolve.
  const [selectedIssueIds, setSelectedIssueIds] = useState(new Set());
  const [bulkResolveBusy, setBulkResolveBusy] = useState(false);
  const [showResolved, setShowResolved] = useState(false);

  // Two independent data sources surfaced side-by-side:
  //   - Project.failed_to_sync  → BMS couldn't pick up an accepted project
  //   - SystemIssue (open)      → upstream-of-BMS failures (polls, accept-persist, broker)
  const { data: projects = [], isLoading: projLoading, isError: projError, error: projErr, refetch: refetchProjects, isFetching: projFetching } = useQuery({
    queryKey: ['failed-projects'],
    queryFn: () => base44.entities.Project.filter({ state: 'failed_to_sync' }, '-accepted_at', 200),
    staleTime: 30_000,
  });

  // Pull a wider window than before. Old 200 limit was capping the OPEN list
  // when there were many resolved issues in front of it. 1000 covers months
  // of normal operation; if we ever exceed it the auto-resolve cron should
  // be drained first anyway.
  const { data: systemIssuesRaw = [], isLoading: sysLoading, isError: sysError, error: sysErr, refetch: refetchSystem, isFetching: sysFetching } = useQuery({
    queryKey: ['system-issues'],
    queryFn: () => base44.entities.SystemIssue.list('-last_seen_at', 1000),
    staleTime: 30_000,
  });
  // Filter client-side — the entity API doesn't reliably filter on null.
  const systemIssues = useMemo(() => systemIssuesRaw.filter(i => !i.resolved_at), [systemIssuesRaw]);
  const resolvedIssues = useMemo(() => systemIssuesRaw.filter(i => i.resolved_at).slice(0, 30), [systemIssuesRaw]);
  const criticalCount = systemIssues.filter(i => i.severity === 'critical').length;

  const portals = useMemo(() => [...new Set(projects.map(p => p.portal))], [projects]);

  const filteredProjects = useMemo(() => {
    const q = search.trim().toLowerCase();
    return projects.filter(p => {
      if (portalFilter !== 'all' && p.portal !== portalFilter) return false;
      if (!q) return true;
      return (
        p.name?.toLowerCase().includes(q) ||
        p.client_name?.toLowerCase().includes(q) ||
        p.external_id?.toLowerCase().includes(q) ||
        p.sync_error?.toLowerCase().includes(q)
      );
    });
  }, [projects, search, portalFilter]);

  const resetOne = async (project) => {
    const res = await base44.functions.invoke('projectResetSync', { project_id: project.id });
    return res.data?.success ? { ok: true } : { ok: false, error: res.data?.error };
  };

  const handleReset = async (project) => {
    setResettingIds(prev => new Set([...prev, project.id]));
    try {
      const r = await resetOne(project);
      if (r.ok) {
        toast.success(`"${project.name}" reset — waiting for BMS pickup`);
        qc.invalidateQueries({ queryKey: ['failed-projects'] });
      } else {
        toast.error(r.error || 'Reset failed');
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setResettingIds(prev => { const s = new Set(prev); s.delete(project.id); return s; });
    }
  };

  const toggleSelect = (project) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(project.id)) next.delete(project.id); else next.add(project.id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredProjects.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredProjects.map(p => p.id)));
  };

  const handleBulkReset = async () => {
    const targets = filteredProjects.filter(p => selectedIds.has(p.id));
    if (targets.length === 0) return;
    setBulkBusy(true);
    let ok = 0, fail = 0;
    for (const p of targets) {
      try {
        const r = await resetOne(p);
        if (r.ok) ok++; else fail++;
      } catch { fail++; }
    }
    toast[fail === 0 ? 'success' : 'warning'](`Reset: ${ok} ok${fail ? `, ${fail} failed` : ''}`);
    setSelectedIds(new Set());
    setBulkBusy(false);
    qc.invalidateQueries({ queryKey: ['failed-projects'] });
  };

  const handleResolveIssue = async (issue) => {
    setResolvingIds(prev => new Set([...prev, issue.id]));
    try {
      const res = await base44.functions.invoke('resolveSystemIssues', { issue_id: issue.id });
      if (res.data?.ok) {
        toast.success('Issue resolved');
        qc.invalidateQueries({ queryKey: ['system-issues'] });
        qc.invalidateQueries({ queryKey: ['system-issues-open-count'] });
      } else {
        toast.error(res.data?.error || 'Resolve failed');
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setResolvingIds(prev => { const s = new Set(prev); s.delete(issue.id); return s; });
    }
  };

  const toggleSelectIssue = (issue) => {
    setSelectedIssueIds(prev => {
      const next = new Set(prev);
      if (next.has(issue.id)) next.delete(issue.id); else next.add(issue.id);
      return next;
    });
  };
  const toggleSelectAllIssues = () => {
    if (selectedIssueIds.size === systemIssues.length) setSelectedIssueIds(new Set());
    else setSelectedIssueIds(new Set(systemIssues.map(i => i.id)));
  };
  const handleBulkResolveIssues = async () => {
    if (selectedIssueIds.size === 0) return;
    setBulkResolveBusy(true);
    try {
      const res = await base44.functions.invoke('resolveSystemIssues', {
        issue_ids: Array.from(selectedIssueIds),
      });
      const closed = res.data?.closed ?? 0;
      toast.success(`Resolved ${closed} issue${closed === 1 ? '' : 's'}`);
      setSelectedIssueIds(new Set());
      qc.invalidateQueries({ queryKey: ['system-issues'] });
      qc.invalidateQueries({ queryKey: ['system-issues-open-count'] });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBulkResolveBusy(false);
    }
  };

  const refetchAll = () => { refetchProjects(); refetchSystem(); };
  const anyFetching = projFetching || sysFetching;

  return (
    <div className="px-8 py-7 max-w-6xl">
      <header className="flex items-end justify-between mb-7 flex-wrap gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-ink-1">Issues</h1>
          <p className="text-[13px] text-ink-3 mt-1 italic-editorial">
            Operational alerts and projects the BMS couldn't pick up.
          </p>
        </div>
        <button
          onClick={refetchAll}
          disabled={anyFetching}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-line-1 bg-surface-1 text-[13px] text-ink-2 hover:bg-surface-2 transition-colors duration-tab disabled:opacity-40"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${anyFetching ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </header>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className={`border rounded-md p-3.5 ${criticalCount > 0 ? 'bg-danger-soft border-danger/30' : 'bg-surface-1 border-line-1'}`}>
          <div className="flex items-center gap-1.5">
            <AlertCircle className={`w-3 h-3 ${criticalCount > 0 ? 'text-danger' : 'text-ink-3'}`} />
            <p className={`text-[10px] uppercase tracking-wider ${criticalCount > 0 ? 'text-danger' : 'text-ink-3'}`}>Critical</p>
          </div>
          <p className={`text-[22px] font-semibold tabular-nums mt-0.5 ${criticalCount > 0 ? 'text-danger' : 'text-ink-1'}`}>{fmtNumber(criticalCount)}</p>
        </div>
        <div className="bg-surface-1 border border-line-1 rounded-md p-3.5">
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="w-3 h-3 text-warning" />
            <p className="text-[10px] uppercase tracking-wider text-ink-3">System issues</p>
          </div>
          <p className="text-[22px] font-semibold tabular-nums mt-0.5 text-ink-1">{fmtNumber(systemIssues.length)}</p>
        </div>
        <div className={`border rounded-md p-3.5 ${projects.length > 0 ? 'bg-danger-soft border-danger/30' : 'bg-surface-1 border-line-1'}`}>
          <p className={`text-[10px] uppercase tracking-wider ${projects.length > 0 ? 'text-danger' : 'text-ink-3'}`}>Failed BMS syncs</p>
          <p className={`text-[22px] font-semibold tabular-nums mt-0.5 ${projects.length > 0 ? 'text-danger' : 'text-ink-1'}`}>{fmtNumber(projects.length)}</p>
        </div>
        <div className="bg-surface-1 border border-line-1 rounded-md p-3.5">
          <p className="text-[10px] uppercase tracking-wider text-ink-3">Portals affected</p>
          <p className="text-[22px] font-semibold tabular-nums mt-0.5 text-ink-1">{portals.length}</p>
        </div>
      </div>

      {/* System Issues section */}
      <section className="mb-10">
        <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
          <div>
            <h2 className="text-[14px] font-semibold tracking-tight text-ink-1">System issues</h2>
            <p className="text-[11px] text-ink-3 italic-editorial mt-0.5">
              Poll failures, accept-persist failures, and broker outages. Auto-resolve when the next run succeeds.
            </p>
          </div>
          {resolvedIssues.length > 0 && (
            <button
              onClick={() => setShowResolved(s => !s)}
              className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-line-1 bg-surface-1 text-[11px] font-medium text-ink-2 hover:bg-surface-2 transition-colors"
            >
              <History className="w-3 h-3" />
              {showResolved ? 'Hide history' : `Show resolved (${resolvedIssues.length})`}
            </button>
          )}
        </div>

        <BulkActionBar
          count={selectedIssueIds.size}
          busy={bulkResolveBusy}
          onAccept={handleBulkResolveIssues}
          acceptLabel="Resolve selected"
          canReject={false}
          onClear={() => setSelectedIssueIds(new Set())}
        />

        {sysError ? (
          <ErrorState error={sysErr} onRetry={refetchSystem} />
        ) : sysLoading ? (
          <div className="space-y-2">{[1,2].map(i => <Skeleton key={i} className="h-12" />)}</div>
        ) : systemIssues.length === 0 ? (
          <EmptyState
            title="All clear"
            body="No open system issues — every poll and accept is landing cleanly."
          />
        ) : (
          <SystemIssuesTable
            issues={systemIssues}
            selectable
            selectedIds={selectedIssueIds}
            onToggleSelect={toggleSelectIssue}
            onToggleSelectAll={toggleSelectAllIssues}
            resolvingIds={resolvingIds}
            onResolve={handleResolveIssue}
          />
        )}

        {showResolved && resolvedIssues.length > 0 && (
          <div className="mt-5">
            <p className="text-[10px] uppercase tracking-wider text-ink-3 mb-2">Recently resolved</p>
            <SystemIssuesTable issues={resolvedIssues} resolved />
          </div>
        )}
      </section>

      {/* Failed BMS Syncs section */}
      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-[14px] font-semibold tracking-tight text-ink-1">Failed BMS syncs</h2>
          <p className="text-[11px] text-ink-3 italic-editorial">
            Projects the BMS couldn't pick up. Reset them to <code className="not-italic font-mono">accepted</code> to retry.
          </p>
        </div>

        {projects.length > 0 && (
          <div className="flex items-center gap-3 mb-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-3" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search project, client, error message"
                className="field-control w-full h-9 pl-9 pr-3 rounded-md border border-line-1 bg-surface-1 text-[13px] outline-none placeholder:text-ink-4"
              />
            </div>
            {portals.length > 1 && (
              <select
                value={portalFilter}
                onChange={e => setPortalFilter(e.target.value)}
                className="field-control h-9 px-3 rounded-md border border-line-1 bg-surface-1 text-[13px] text-ink-1 outline-none"
              >
                <option value="all">All portals</option>
                {portals.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            )}
          </div>
        )}

        <BulkActionBar
          count={selectedIds.size}
          busy={bulkBusy}
          onAccept={handleBulkReset}
          acceptLabel="Reset selected"
          canReject={false}
          onClear={() => setSelectedIds(new Set())}
        />

        {projError ? (
          <ErrorState error={projErr} onRetry={refetchProjects} />
        ) : projLoading ? (
          <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-14" />)}</div>
        ) : filteredProjects.length === 0 ? (
          <EmptyState
            title={projects.length === 0 ? 'No failed syncs' : 'No matches'}
            body={projects.length === 0
              ? "Every project synced cleanly — nothing to recover."
              : 'Refine your search or clear the filter.'}
          />
        ) : (
          <div className="bg-surface-1 border border-line-1 rounded-md overflow-hidden">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-surface-2 border-b border-line-1 text-[10px] uppercase tracking-wider text-ink-3">
                  <th className="px-3 py-2 w-8">
                    <input
                      type="checkbox"
                      checked={filteredProjects.length > 0 && selectedIds.size === filteredProjects.length}
                      ref={el => { if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < filteredProjects.length; }}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 accent-[var(--accent)] cursor-pointer"
                      aria-label="Select all"
                    />
                  </th>
                  <th className="px-2 py-2 w-6" />
                  <th className="text-left px-3 py-2 font-medium">Project</th>
                  <th className="text-left px-3 py-2 font-medium">Portal</th>
                  <th className="text-left px-3 py-2 font-medium">Error</th>
                  <th className="text-right px-3 py-2 font-medium">Accepted</th>
                  <th className="text-right px-3 py-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredProjects.map(p => (
                  <IssueRow
                    key={p.id}
                    project={p}
                    busy={resettingIds.has(p.id)}
                    onReset={handleReset}
                    selected={selectedIds.has(p.id)}
                    onToggleSelect={toggleSelect}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}