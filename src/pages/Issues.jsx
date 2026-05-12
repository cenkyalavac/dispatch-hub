import { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Search, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

import IssueRow from '@/components/issues/IssueRow';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/ui/EmptyState';
import { fmtNumber } from '@/lib/format';

export default function Issues() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [portalFilter, setPortalFilter] = useState('all');
  const [resettingIds, setResettingIds] = useState(new Set());

  const { data: projects = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['failed-projects'],
    queryFn: () => base44.entities.Project.filter({ state: 'failed_to_sync' }, '-accepted_at', 200),
    staleTime: 30_000,
  });

  const portals = useMemo(() => [...new Set(projects.map(p => p.portal))], [projects]);

  const filtered = useMemo(() => {
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

  const handleReset = async (project) => {
    setResettingIds(prev => new Set([...prev, project.id]));
    try {
      const res = await base44.functions.invoke('projectResetSync', { project_id: project.id });
      if (res.data?.success) {
        toast.success(`"${project.name}" reset — waiting for BMS pickup`);
        qc.invalidateQueries({ queryKey: ['failed-projects'] });
      } else {
        toast.error(res.data?.error || 'Reset failed');
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setResettingIds(prev => { const s = new Set(prev); s.delete(project.id); return s; });
    }
  };

  return (
    <div className="px-8 py-7 max-w-6xl">
      <header className="flex items-end justify-between mb-7 flex-wrap gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-ink-1">Issues</h1>
          <p className="text-[13px] text-ink-3 mt-1 italic-editorial">
            Projects the BMS couldn't pick up. Reset them to <code className="not-italic font-mono">accepted</code> to retry.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-line-1 bg-surface-1 text-[13px] text-ink-2 hover:bg-surface-2 transition-colors duration-tab disabled:opacity-40"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </header>

      {!isLoading && projects.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5">
          <div className="bg-danger-soft border border-danger/30 rounded-md p-3.5">
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="w-3 h-3 text-danger" />
              <p className="text-[10px] uppercase tracking-wider text-danger">Failed</p>
            </div>
            <p className="text-[22px] font-semibold tabular-nums mt-0.5 text-danger">{fmtNumber(projects.length)}</p>
          </div>
          <div className="bg-surface-1 border border-line-1 rounded-md p-3.5">
            <p className="text-[10px] uppercase tracking-wider text-ink-3">Portals affected</p>
            <p className="text-[22px] font-semibold tabular-nums mt-0.5 text-ink-1">{portals.length}</p>
          </div>
          <div className="bg-surface-1 border border-line-1 rounded-md p-3.5">
            <p className="text-[10px] uppercase tracking-wider text-ink-3">Showing</p>
            <p className="text-[22px] font-semibold tabular-nums mt-0.5 text-ink-1">{fmtNumber(filtered.length)}</p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 mb-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-3" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search project, client, error message"
            className="w-full h-9 pl-9 pr-3 rounded-md border border-line-1 bg-surface-1 text-[13px] outline-none placeholder:text-ink-4"
          />
        </div>
        {portals.length > 1 && (
          <select
            value={portalFilter}
            onChange={e => setPortalFilter(e.target.value)}
            className="h-9 px-3 rounded-md border border-line-1 bg-surface-1 text-[13px] text-ink-1 outline-none"
          >
            <option value="all">All portals</option>
            {portals.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-14" />)}</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={projects.length === 0 ? 'No issues' : 'No matches'}
          body={projects.length === 0
            ? "Every project synced cleanly — nothing to recover."
            : 'Refine your search or clear the filter.'}
        />
      ) : (
        <div className="bg-surface-1 border border-line-1 rounded-md overflow-hidden">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-surface-2 border-b border-line-1 text-[10px] uppercase tracking-wider text-ink-3">
                <th className="px-2 py-2 w-6" />
                <th className="text-left px-3 py-2 font-medium">Project</th>
                <th className="text-left px-3 py-2 font-medium">Portal</th>
                <th className="text-left px-3 py-2 font-medium">Error</th>
                <th className="text-right px-3 py-2 font-medium">Accepted</th>
                <th className="text-right px-3 py-2 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <IssueRow
                  key={p.id}
                  project={p}
                  busy={resettingIds.has(p.id)}
                  onReset={handleReset}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}