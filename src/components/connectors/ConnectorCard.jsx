import { Switch } from '@/components/ui/switch';
import {
  CheckCircle2, AlertCircle, XCircle, ExternalLink, ArrowUpRight,
  Globe, Building2, Network, Plug, Boxes, Briefcase, Cloud,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import JwtExpiryBadge from './JwtExpiryBadge';
import SheetRoutesSummary from './SheetRoutesSummary';
import BrokerHealthBadge from './BrokerHealthBadge';

const ICON_MAP = { Globe, Building2, Network, Plug, Boxes, Briefcase, Cloud };

const STATUS_MAP = {
  connected:      { Icon: CheckCircle2, pill: 'bg-success-soft text-success border-success/20', label: 'Connected' },
  error:          { Icon: XCircle,      pill: 'bg-danger-soft text-danger border-danger/20',    label: 'Error' },
  disconnected:   { Icon: AlertCircle,  pill: 'bg-warning-soft text-warning border-warning/30', label: 'Disconnected' },
  not_configured: { Icon: AlertCircle,  pill: 'bg-surface-2 text-ink-3 border-line-1',          label: 'Not configured' },
};

const AUTH_LABEL = {
  oauth2_client_credentials: 'OAuth 2.0',
  jwt_bearer: 'JWT',
  api_key: 'API key',
  none: 'No auth',
};

function parseJwtDays(message) {
  if (!message) return null;
  const m = message.match(/\[jwt:(-?\d+)\]/);
  return m ? Number(m[1]) : null;
}

// onTest / onDelete props are accepted but unused — kept so the page-level
// handlers remain wired (delete now lives only in the detail-page danger zone;
// test now lives only on the detail-page Overview tab). The whole card is the
// "Open" affordance — click anywhere outside the toggle/docs link to navigate.
export default function ConnectorCard({
  portal, onToggle, missingSecrets = [], client = null,
}) {
  const navigate = useNavigate();
  const status = STATUS_MAP[portal.connection_status || 'not_configured'];
  const StatusIcon = status.Icon;
  const Icon = ICON_MAP[portal.icon] || Globe;
  const hasMissing = missingSecrets.length > 0;
  const jwtDays = parseJwtDays(portal.connection_message);
  const cleanMessage = portal.connection_message?.replace(/\s*\[jwt:-?\d+\]\s*$/, '').trim();

  const openDetail = () => navigate(`/portals/${portal.key}`);
  const onKeyDown = (e) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(); }
  };
  // Stop the card's onClick from firing when interactive children are used.
  const stop = (e) => e.stopPropagation();

  return (
    <article
      role="link"
      tabIndex={0}
      onClick={openDetail}
      onKeyDown={onKeyDown}
      className="group bg-surface-1 border border-line-1 rounded-md flex flex-col overflow-hidden cursor-pointer hover:border-ink-4 hover:shadow-sm transition-all duration-tab"
      aria-label={`Open ${portal.name}`}
    >
      <header className="flex items-start gap-3 px-5 pt-4 pb-3">
        <div className="w-9 h-9 rounded-md bg-accent-soft flex items-center justify-center flex-shrink-0">
          <Icon className="w-4 h-4 text-accent-ink" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-[14px] font-semibold tracking-tight text-ink-1 truncate inline-flex items-center gap-1.5">
            {portal.name}
            <ArrowUpRight className="w-3.5 h-3.5 text-ink-4 opacity-0 group-hover:opacity-100 transition-opacity duration-tab" />
          </h3>
          <p className="text-[12px] text-ink-3 italic-editorial mt-0.5 truncate">
            {client ? (
              <>for <span className="not-italic text-ink-2 font-medium">{client.display_name}</span></>
            ) : portal.client_id ? (
              <span className="text-warning not-italic">client missing</span>
            ) : (
              <>unassigned client</>
            )}
          </p>
        </div>
        <div onClick={stop} onKeyDown={stop}>
          <Switch
            checked={portal.is_active}
            onCheckedChange={(v) => onToggle?.(portal, v)}
            aria-label={`Toggle ${portal.name}`}
          />
        </div>
      </header>

      <div className="px-5 pb-3 flex items-center gap-2 flex-wrap">
        <span className={`inline-flex items-center gap-1.5 h-6 px-2 rounded border text-[11px] font-medium ${status.pill}`}>
          <StatusIcon className="w-3 h-3" />
          {status.label}
        </span>
        <span className="inline-flex items-center h-6 px-2 rounded bg-surface-2 text-ink-3 text-[10px] font-mono uppercase tracking-wider">
          {portal.key}
        </span>
        {portal.auth_type && (
          <span className="inline-flex items-center h-6 px-2 rounded bg-surface-2 text-ink-3 text-[10px]">
            {AUTH_LABEL[portal.auth_type] || portal.auth_type}
          </span>
        )}
        {jwtDays !== null && <JwtExpiryBadge days={jwtDays} />}
        {portal.key === 'globallink' && <BrokerHealthBadge lastSyncAt={portal.last_sync_at} />}
      </div>

      <div className="px-5 pb-4 space-y-2 flex-1">
        {portal.description && (
          <p className="text-[12px] text-ink-2 leading-relaxed">{portal.description}</p>
        )}
        {cleanMessage && (
          <p className="text-[12px] text-ink-3 italic-editorial border-l-2 border-line-2 pl-2.5 py-0.5">
            {cleanMessage}
          </p>
        )}
        {hasMissing && (
          <div className="text-[11px] bg-warning-soft border border-warning/30 text-warning rounded px-2.5 py-1.5">
            <span className="font-medium">Missing secrets:</span> {missingSecrets.join(', ')}
          </div>
        )}
        <SheetRoutesSummary portal={portal} />
      </div>

      <div className="px-5 py-3 border-t border-line-1 flex items-center justify-between text-[11px] text-ink-3">
        <span>
          {portal.last_checked_at
            ? `Tested ${formatDistanceToNow(new Date(portal.last_checked_at), { addSuffix: true })}`
            : 'Never tested'}
        </span>
        {portal.docs_url && (
          <a
            href={portal.docs_url}
            target="_blank"
            rel="noreferrer"
            onClick={stop}
            className="inline-flex items-center gap-1 hover:text-ink-1 transition-colors duration-tab"
          >
            API docs <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
    </article>
  );
}