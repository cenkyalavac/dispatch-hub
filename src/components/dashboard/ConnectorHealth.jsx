import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { ArrowRight } from 'lucide-react';
import { EM, fmtNumber } from '@/lib/format';

const STATUS_DOT = {
  connected: 'bg-success',
  disconnected: 'bg-ink-4',
  error: 'bg-danger',
  not_configured: 'bg-warning',
};
const STATUS_LABEL = {
  connected: 'Connected',
  disconnected: 'Disconnected',
  error: 'Error',
  not_configured: 'Not configured',
};

// Connector health: per-portal status + last sync + today's accepted volume.
// Big, scannable, the actual hub of "is everything OK?"
export default function ConnectorHealth({ portals, todayCounts }) {
  return (
    <section className="mb-7">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[14px] font-semibold text-ink-1">Connector health</h2>
        <Link to="/portals" className="inline-flex items-center gap-1 text-[12px] text-ink-3 hover:text-ink-1 transition-colors duration-tab">
          Manage <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {portals.map((p) => {
          const dot = STATUS_DOT[p.connection_status] || 'bg-ink-4';
          const label = STATUS_LABEL[p.connection_status] || 'Unknown';
          const today = todayCounts[p.key] || 0;
          return (
            <Link
              key={p.key}
              to={`/portals/${p.key}`}
              className="bg-surface-1 border border-line-1 rounded-md p-4 hover:bg-surface-2 transition-colors duration-tab block"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-ink-1 truncate">{p.name}</p>
                  <p className="text-[11px] text-ink-3 truncate">{p.vendor || p.key}</p>
                </div>
                <span className={`w-2 h-2 rounded-full ${dot} flex-shrink-0 mt-1.5`} />
              </div>
              <div className="flex items-baseline justify-between mt-3">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-ink-3">Today</p>
                  <p className="text-[20px] font-semibold tabular-nums text-ink-1">{fmtNumber(today)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-wider text-ink-3">{label}</p>
                  <p className="text-[11px] text-ink-3 italic-editorial">
                    {p.last_sync_at ? `synced ${formatDistanceToNow(new Date(p.last_sync_at), { addSuffix: true })}` : EM}
                  </p>
                </div>
              </div>
              {!p.is_active && (
                <p className="mt-2 text-[10px] uppercase tracking-wider text-warning">Disabled</p>
              )}
            </Link>
          );
        })}
      </div>
    </section>
  );
}