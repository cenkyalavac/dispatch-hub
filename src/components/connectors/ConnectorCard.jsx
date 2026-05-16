import { Switch } from '@/components/ui/switch';
import {
  CheckCircle2, AlertCircle, XCircle, Loader2, ExternalLink, Play, Trash2, ArrowUpRight,
  Globe, Building2, Network, Plug, Boxes, Briefcase, Cloud,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import JwtExpiryBadge from './JwtExpiryBadge';
import SheetRoutesSummary from './SheetRoutesSummary';

const ICON_MAP = { Globe, Building2, Network, Plug, Boxes, Briefcase, Cloud };

// One quiet pill style for every status — colour conveyed through OKLCH soft
// tokens (success-soft / danger-soft / warning-soft / surface-2) instead of
// Tailwind's emerald/red palette so the cards sit naturally next to Tasks,
// Mappings and History.
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

// Parses "[jwt:N]" tail handleTest stores on connection_message for JWT auth.
function parseJwtDays(message) {
  if (!message) return null;
  const m = message.match(/\[jwt:(-?\d+)\]/);
  return m ? Number(m[1]) : null;
}

export default function ConnectorCard({
  portal, testing, onTest, onToggle, onDelete, missingSecrets = [], client = null,
}) {
  const status = STATUS_MAP[portal.connection_status || 'not_configured'];
  const StatusIcon = status.Icon;
  const Icon = ICON_MAP[portal.icon] || Globe;
  const hasMissing = missingSecrets.length > 0;
  const jwtDays = parseJwtDays(portal.connection_message);
  const cleanMessage = portal.connection_message?.replace(/\s*\[jwt:-?\d+\]\s*$/, '').trim();

  return (
    <article className="bg-surface-1 border border-line-1 rounded-md flex flex-col overflow-hidden">
      {/* Header: identity + toggle. No gradient, no ring — surface-1 only. */}
      <header className="flex items-start gap-3 px-5 pt-4 pb-3">
        <div className="w-9 h-9 rounded-md bg-accent-soft flex items-center justify-center flex-shrink-0">
          <Icon className="w-4 h-4 text-accent-ink" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-[14px] font-semibold tracking-tight text-ink-1 truncate">
            {portal.name}
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
        <Switch
          checked={portal.is_active}
          onCheckedChange={(v) => onToggle?.(portal, v)}
        />
      </header>

      {/* Status row: pill + key/auth badges. One line. */}
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
      </div>

      {/* Body: description / message / warnings — all editorial, low contrast. */}
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

      {/* Meta strip: tested-when + API docs link. */}
      <div className="px-5 pb-3 flex items-center justify-between text-[11px] text-ink-3">
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
            className="inline-flex items-center gap-1 hover:text-ink-1 transition-colors duration-tab"
          >
            API docs <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>

      {/* Actions: border-t separator. Open primary, Test ghost, Delete ghost-danger. */}
      <div className="flex items-stretch border-t border-line-1">
        <Link
          to={`/portals/${portal.key}`}
          className="flex-1 inline-flex items-center justify-center gap-1.5 h-10 text-[12px] font-medium text-accent hover:bg-accent-soft transition-colors duration-tab"
        >
          Open <ArrowUpRight className="w-3.5 h-3.5" />
        </Link>
        <button
          type="button"
          onClick={() => onTest?.(portal)}
          disabled={testing || hasMissing}
          className="flex-1 inline-flex items-center justify-center gap-1.5 h-10 text-[12px] font-medium text-ink-2 hover:bg-surface-2 border-l border-line-1 transition-colors duration-tab disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {testing
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Testing</>
            : <><Play className="w-3.5 h-3.5" /> Test</>}
        </button>
        {onDelete && (
          <button
            type="button"
            onClick={() => onDelete?.(portal)}
            className="inline-flex items-center justify-center h-10 px-4 text-[12px] font-medium text-danger hover:bg-danger-soft border-l border-line-1 transition-colors duration-tab"
            aria-label="Remove connector"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </article>
  );
}