import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Split, ExternalLink, Sheet } from 'lucide-react';

// Compact strip shown on each ConnectorCard: default Sheet + N conditional routes.
export default function SheetRoutesSummary({ portal }) {
  const { data: routes = [] } = useQuery({
    queryKey: ['sheet-routes', portal.key],
    queryFn: () => base44.entities.SheetRoute.filter({ portal: portal.key }, 'priority', 50),
    enabled: !!portal.key,
    staleTime: 30_000,
  });

  const defaultUrl = portal.sheets_spreadsheet_id
    ? `https://docs.google.com/spreadsheets/d/${portal.sheets_spreadsheet_id}`
    : null;
  const activeCount = routes.filter(r => r.is_active !== false).length;

  if (!defaultUrl && routes.length === 0) return null;

  return (
    <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md bg-surface-2/70 border border-line-1">
      <div className="flex items-center gap-2 min-w-0">
        <Sheet className="w-3.5 h-3.5 text-success shrink-0" />
        {defaultUrl ? (
          <a
            href={defaultUrl}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] text-ink-2 hover:text-ink-1 inline-flex items-center gap-1 truncate"
            title="Open default sheet"
          >
            Default sheet
            {portal.sheets_tab_name ? <span className="text-ink-3">· {portal.sheets_tab_name}</span> : null}
            <ExternalLink className="w-2.5 h-2.5" />
          </a>
        ) : (
          <span className="text-[11px] text-ink-3 italic-editorial">No default sheet</span>
        )}
      </div>
      {routes.length > 0 && (
        <div className="inline-flex items-center gap-1 text-[11px] text-ink-2">
          <Split className="w-3 h-3 text-ink-3" />
          {activeCount}/{routes.length} {routes.length === 1 ? 'route' : 'routes'}
        </div>
      )}
    </div>
  );
}