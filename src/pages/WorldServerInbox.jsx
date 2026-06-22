import { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/ui/EmptyState';
import ListToolbar, { ToolbarSelect } from '@/components/ui/ListToolbar';
import KpiCards from '@/components/worldserver/KpiCards';
import VendorFilter from '@/components/worldserver/VendorFilter';
import WsProjectRow from '@/components/worldserver/WsProjectRow';
import WsProjectDrawer from '@/components/worldserver/WsProjectDrawer';
import { sortProjects, parseWsDate, LOCALE_OPTIONS, STATUS_OPTIONS, statusMeta } from '@/lib/worldserver';

export default function WorldServerInbox() {
  const [search, setSearch] = useState('');
  const [vendors, setVendors] = useState([]);
  const [locale, setLocale] = useState('all');
  const [status, setStatus] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [openId, setOpenId] = useState(null);

  const { data: projects = [], isLoading, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ['ws-projects'],
    queryFn: () => base44.entities.WsProject.list('-created_date', 1000),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const fromTs = from ? new Date(from).getTime() : null;
    const toTs = to ? new Date(to).getTime() + 24 * 60 * 60 * 1000 : null;
    const rows = projects.filter((p) => {
      if (vendors.length && !vendors.includes(p.vendor)) return false;
      if (locale !== 'all' && p.locale !== locale) return false;
      if (status !== 'all' && p.status !== status) return false;
      if (q && !(
        p.pgName?.toLowerCase().includes(q) ||
        p.pgId?.toLowerCase().includes(q) ||
        p.translationRequestId?.toLowerCase().includes(q)
      )) return false;
      if (fromTs || toTs) {
        const c = parseWsDate(p.creationDate)?.getTime();
        if (!c) return false;
        if (fromTs && c < fromTs) return false;
        if (toTs && c >= toTs) return false;
      }
      return true;
    });
    return sortProjects(rows);
  }, [projects, search, vendors, locale, status, from, to]);

  const hasActiveFilters = !!search || vendors.length > 0 || locale !== 'all' || status !== 'all' || !!from || !!to;
  const clearAll = () => { setSearch(''); setVendors([]); setLocale('all'); setStatus('all'); setFrom(''); setTo(''); };

  const openProject = projects.find((p) => p.id === openId) || null;

  return (
    <div className="px-8 py-7 max-w-7xl">
      <header className="flex items-end justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-ink-1">WorldServer Inbox</h1>
          <p className="text-[13px] text-ink-3 mt-1 italic-editorial">
            Incoming Apple WorldServer projects — populated automatically by the broker.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {dataUpdatedAt > 0 && (
            <span className="text-[11px] text-ink-3 italic-editorial" title={new Date(dataUpdatedAt).toLocaleString()}>
              synced {formatDistanceToNow(new Date(dataUpdatedAt), { addSuffix: true })}
            </span>
          )}
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-line-1 bg-surface-1 text-[13px] text-ink-2 hover:bg-surface-2 transition-colors duration-tab disabled:opacity-40"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </header>

      {!isLoading && <KpiCards projects={projects} />}

      <ListToolbar
        search={search}
        onSearchChange={setSearch}
        placeholder="Search project, ID, request"
        totalCount={!isLoading ? projects.length : undefined}
        filteredCount={filtered.length}
        hasActiveFilters={hasActiveFilters}
        onClear={clearAll}
        filters={
          <>
            <VendorFilter selected={vendors} onChange={setVendors} />
            <ToolbarSelect value={locale} onChange={setLocale} ariaLabel="Locale">
              <option value="all">All locales</option>
              {LOCALE_OPTIONS.map((l) => <option key={l} value={l}>{l}</option>)}
            </ToolbarSelect>
            <ToolbarSelect value={status} onChange={setStatus} ariaLabel="Status">
              <option value="all">All statuses</option>
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{statusMeta(s).label}</option>)}
            </ToolbarSelect>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              aria-label="Created from"
              className="field-control h-9 px-3 rounded-md border border-line-1 bg-surface-1 text-[13px] text-ink-1 outline-none"
            />
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              aria-label="Created to"
              className="field-control h-9 px-3 rounded-md border border-line-1 bg-surface-1 text-[13px] text-ink-1 outline-none"
            />
          </>
        }
      />

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-14" />)}</div>
      ) : projects.length === 0 ? (
        <EmptyState
          title="No WorldServer projects yet"
          body="The broker will populate this automatically."
        />
      ) : filtered.length === 0 ? (
        <EmptyState title="Nothing matches" body="Refine your filters or search." />
      ) : (
        <div className="bg-surface-1 border border-line-1 rounded-md overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-surface-2 border-b border-line-1 text-[10px] uppercase tracking-wider text-ink-3">
                <th className="text-left px-3 py-2 font-medium">Project</th>
                <th className="text-left px-3 py-2 font-medium">Vendor</th>
                <th className="text-left px-3 py-2 font-medium">Locale</th>
                <th className="text-right px-3 py-2 font-medium">Words</th>
                <th className="text-left px-3 py-2 font-medium">Status</th>
                <th className="text-left px-3 py-2 font-medium">Created</th>
                <th className="text-left px-3 py-2 font-medium">Due</th>
                <th className="text-left px-3 py-2 font-medium">Delivered</th>
                <th className="text-left px-3 py-2 font-medium">Files</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <WsProjectRow key={p.id} project={p} onOpen={(proj) => setOpenId(proj.id)} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <WsProjectDrawer
        project={openProject}
        open={!!openId}
        onClose={() => setOpenId(null)}
        onSaved={() => refetch()}
      />
    </div>
  );
}