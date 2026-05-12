import { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, Search } from 'lucide-react';
import { format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import { fmtNumber, EM } from '@/lib/format';

const DAY_OPTIONS = [7, 14, 30];

export default function History() {
  const [days, setDays] = useState(30);
  const [search, setSearch] = useState('');

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['symfonie-history', days],
    queryFn: async () => {
      const res = await base44.functions.invoke('symfonieHistory', { days });
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: false,
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
            Completed & Approved tasks — read-only, not synced to sheet.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="h-9 px-3 rounded-md border border-line-1 bg-surface-1 text-[13px] text-ink-1 outline-none"
          >
            {DAY_OPTIONS.map(d => <option key={d} value={d}>Last {d} days</option>)}
          </select>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
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

      {isError ? (
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
                <th className="text-left px-3 py-2 font-medium">Task</th>
                <th className="text-left px-3 py-2 font-medium">Project</th>
                <th className="text-left px-3 py-2 font-medium">Lang</th>
                <th className="text-left px-3 py-2 font-medium">Workflow</th>
                <th className="text-left px-3 py-2 font-medium">State</th>
                <th className="text-right px-3 py-2 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => (
                <tr key={t.id} className="border-b border-line-1 last:border-0 hover:bg-surface-2 transition-colors">
                  <td className="px-3 py-2 text-ink-1 max-w-[260px] truncate" title={t.name}>{t.name || EM}</td>
                  <td className="px-3 py-2 text-ink-2 max-w-[200px] truncate" title={t.project_name}>
                    {t.project_name || EM}
                    {t.account_code && <span className="ml-1.5 font-mono text-[10px] text-ink-4">{t.account_code}</span>}
                  </td>
                  <td className="px-3 py-2 font-mono text-ink-2">{t.source_language || EM}→{t.target_language || EM}</td>
                  <td className="px-3 py-2 text-ink-3">{t.workflow_name || EM}</td>
                  <td className="px-3 py-2">
                    <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${
                      t.state === 'Approved' ? 'bg-success-soft text-success' : 'bg-accent-soft text-accent-ink'
                    }`}>{t.state}</span>
                  </td>
                  <td className="px-3 py-2 text-right text-ink-3 tabular-nums">
                    {t.updated_at ? format(new Date(t.updated_at), 'dd MMM HH:mm') : EM}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}