import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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

const COLOR_MAP = {
  blue:    { bg: 'from-blue-500/10 to-indigo-500/10',     ring: 'ring-blue-500/20',    icon: 'bg-blue-500' },
  purple:  { bg: 'from-purple-500/10 to-fuchsia-500/10',  ring: 'ring-purple-500/20',  icon: 'bg-purple-500' },
  emerald: { bg: 'from-emerald-500/10 to-teal-500/10',    ring: 'ring-emerald-500/20', icon: 'bg-emerald-500' },
  amber:   { bg: 'from-amber-500/10 to-orange-500/10',    ring: 'ring-amber-500/20',   icon: 'bg-amber-500' },
  rose:    { bg: 'from-rose-500/10 to-pink-500/10',       ring: 'ring-rose-500/20',    icon: 'bg-rose-500' },
};

const STATUS_MAP = {
  connected:      { icon: CheckCircle2, color: 'text-emerald-600',  bg: 'bg-emerald-50 border-emerald-200',  label: 'Connected' },
  error:          { icon: XCircle,      color: 'text-red-600',       bg: 'bg-red-50 border-red-200',          label: 'Error' },
  disconnected:   { icon: AlertCircle,  color: 'text-amber-600',     bg: 'bg-amber-50 border-amber-200',      label: 'Disconnected' },
  not_configured: { icon: AlertCircle,  color: 'text-slate-500',     bg: 'bg-slate-50 border-slate-200',      label: 'Not configured' },
};

// Parses "[jwt:N]" tail that handleTest stores on connection_message for JWT-auth connectors.
function parseJwtDays(message) {
  if (!message) return null;
  const m = message.match(/\[jwt:(-?\d+)\]/);
  return m ? Number(m[1]) : null;
}

export default function ConnectorCard({ portal, testing, onTest, onToggle, onDelete, missingSecrets = [] }) {
  const colors = COLOR_MAP[portal.color] || COLOR_MAP.blue;
  const status = STATUS_MAP[portal.connection_status || 'not_configured'];
  const StatusIcon = status.icon;
  const Icon = ICON_MAP[portal.icon] || Globe;
  const hasMissing = missingSecrets.length > 0;
  const jwtDays = parseJwtDays(portal.connection_message);
  const cleanMessage = portal.connection_message?.replace(/\s*\[jwt:-?\d+\]\s*$/, '').trim();

  return (
    <Card className={`overflow-hidden shadow-sm hover:shadow-md transition-shadow ring-1 ${colors.ring}`}>
      <div className={`bg-gradient-to-br ${colors.bg} px-6 py-5`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className={`w-11 h-11 rounded-xl ${colors.icon} flex items-center justify-center shadow-sm`}>
              <Icon className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-base text-foreground">{portal.name}</h3>
                {portal.vendor && (
                  <span className="text-xs text-muted-foreground">by {portal.vendor}</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{portal.description || 'No description'}</p>
            </div>
          </div>
          <Switch
            checked={portal.is_active}
            onCheckedChange={(v) => onToggle?.(portal, v)}
          />
        </div>
      </div>

      <CardContent className="px-6 py-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium ${status.bg} ${status.color}`}>
            <StatusIcon className="w-3.5 h-3.5" />
            {status.label}
          </div>
          <div className="flex items-center gap-1.5">
            <Badge variant="outline" className="text-[10px] font-mono uppercase">{portal.key}</Badge>
            {portal.auth_type && (
              <Badge variant="outline" className="text-[10px]">
                {portal.auth_type === 'oauth2_client_credentials' ? 'OAuth 2.0' :
                 portal.auth_type === 'jwt_bearer' ? 'JWT' :
                 portal.auth_type === 'api_key' ? 'API Key' : portal.auth_type}
              </Badge>
            )}
          </div>
        </div>

        {cleanMessage && (
          <p className="text-xs text-muted-foreground bg-secondary/50 px-2.5 py-1.5 rounded">
            {cleanMessage}
          </p>
        )}

        {jwtDays !== null && <JwtExpiryBadge days={jwtDays} />}

        {hasMissing && (
          <div className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-md px-2.5 py-1.5">
            <span className="font-medium">Missing secrets:</span> {missingSecrets.join(', ')}
          </div>
        )}

        <SheetRoutesSummary portal={portal} />

        <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
          <span>
            {portal.last_checked_at
              ? `Tested ${formatDistanceToNow(new Date(portal.last_checked_at), { addSuffix: true })}`
              : 'Never tested'}
          </span>
          {portal.docs_url && (
            <a href={portal.docs_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
              API Docs <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>

        <div className="flex items-center gap-2 pt-2 border-t border-border/60">
          <Button asChild size="sm" className="flex-1 gap-1.5 h-8">
            <Link to={`/portals/${portal.key}`}>
              Open <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onTest?.(portal)}
            disabled={testing || hasMissing}
            className="gap-1.5 h-8"
          >
            {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            {testing ? 'Testing...' : 'Test'}
          </Button>
          {onDelete && (
            <Button size="sm" variant="ghost" onClick={() => onDelete?.(portal)} className="h-8 px-2 text-destructive hover:text-destructive">
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}