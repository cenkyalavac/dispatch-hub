import { Link } from 'react-router-dom';
import { fmtNumber } from '@/lib/format';

const STATUS_DOT = {
  connected: 'bg-success',
  disconnected: 'bg-ink-4',
  error: 'bg-danger',
  not_configured: 'bg-warning',
};

export default function ConnectorRow({ portal, processedCount = 0 }) {
  const dot = STATUS_DOT[portal.connection_status] || 'bg-ink-4';
  return (
    <Link
      to="/portals"
      className="flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-surface-2 transition-colors duration-tab"
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dot} flex-shrink-0`} />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-ink-1 truncate">{portal.name}</p>
        <p className="text-[11px] text-ink-3 truncate">
          {portal.vendor || portal.key} · {portal.connection_status?.replace('_', ' ') || 'unknown'}
        </p>
      </div>
      <span className="text-[12px] text-ink-3 tabular-nums">{fmtNumber(processedCount)}</span>
    </Link>
  );
}