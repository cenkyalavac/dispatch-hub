import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { ArrowRight, Inbox } from 'lucide-react';
import { EM, fmtNumber } from '@/lib/format';

// Merged "Connectors" card — replaces what used to be two separate sections
// (Connector health + Action needed). One block per portal: status dot +
// last-sync line at the top, pending count, top 5 pending preview, deep link.
// Health context is derived from b.portal (connection_status, last_sync_at,
// is_active) so no extra props are needed.

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

function portalPendingPath(portalKey) {
  if (portalKey === 'globallink') return '/globallink/pending';
  return `/pending/${portalKey}`;
}

function PortalBlock({ portal, items, total }) {
  const dot = STATUS_DOT[portal.connection_status] || 'bg-ink-4';
  const statusLabel = STATUS_LABEL[portal.connection_status] || 'Unknown';
  const synced = portal.last_sync_at
    ? `synced ${formatDistanceToNow(new Date(portal.last_sync_at), { addSuffix: true })}`
    : EM;

  return (
    <section className="bg-surface-1 border border-line-1 rounded-md flex flex-col">
      {/* Header: name + status + last sync */}
      <header className="px-4 pt-3 pb-2.5 border-b border-line-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link
              to={`/portals/${portal.key}`}
              className="text-[13px] font-semibold text-ink-1 hover:text-accent transition-colors duration-tab truncate block"
            >
              {portal.name}
            </Link>
            <p className="text-[11px] text-ink-3 truncate">{portal.vendor || portal.key}</p>
          </div>
          <span className={`w-2 h-2 rounded-full ${dot} flex-shrink-0 mt-1.5`} title={statusLabel} />
        </div>
        <div className="flex items-baseline justify-between mt-2">
          <span className="text-[11px] text-ink-3">{statusLabel}</span>
          <span className="text-[11px] text-ink-3 italic-editorial truncate ml-2">{synced}</span>
        </div>
        {!portal.is_active && (
          <p className="mt-1.5 text-[10px] uppercase tracking-wider text-warning">Disabled</p>
        )}
      </header>

      {/* Pending preview */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-line-1">
        <span className="text-[11px] uppercase tracking-wider text-ink-3">
          {fmtNumber(total)} pending
        </span>
        <Link
          to={portalPendingPath(portal.key)}
          className="inline-flex items-center gap-1 text-[11px] text-ink-3 hover:text-ink-1 transition-colors duration-tab"
        >
          See all <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
      {items.length === 0 ? (
        <div className="px-4 py-5 text-center flex-1 flex flex-col items-center justify-center">
          <Inbox className="w-4 h-4 mx-auto text-ink-4 mb-1.5" />
          <p className="text-[11px] text-ink-3 italic-editorial">Nothing waiting.</p>
        </div>
      ) : (
        <div className="divide-y divide-line-1">
          {items.slice(0, 5).map((it) => (
            <Link
              key={it.id}
              to={portalPendingPath(portal.key)}
              className="flex items-center gap-3 px-4 py-2 hover:bg-surface-2 transition-colors duration-tab"
            >
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-medium text-ink-1 truncate">
                  {it.task_name || it.submission_name || it.name || EM}
                </p>
                <p className="text-[11px] text-ink-3 truncate font-mono">
                  {it.source_language || EM} → {it.target_language || EM}
                  {it.project_name && <span className="font-sans"> · {it.project_name}</span>}
                </p>
              </div>
              <span className="text-[11px] text-ink-3 tabular-nums flex-shrink-0">
                {(it.word_count || 0).toLocaleString()} w
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

export default function ActionNeeded({ portalBuckets }) {
  const visible = portalBuckets.filter(b => b.total > 0 || b.portal.is_active);
  if (visible.length === 0) return null;

  return (
    <section className="mb-7">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[14px] font-semibold text-ink-1">Connectors</h2>
        <Link
          to="/portals"
          className="inline-flex items-center gap-1 text-[12px] text-ink-3 hover:text-ink-1 transition-colors duration-tab"
        >
          Manage <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {visible.map((b) => (
          <PortalBlock key={b.portal.key} portal={b.portal} items={b.items} total={b.total} />
        ))}
      </div>
    </section>
  );
}