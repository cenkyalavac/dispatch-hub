import { Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, AlertCircle, XCircle, Globe, Building2, Network, Plug, Boxes, Briefcase, Cloud } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import PortalDocsMenu from './PortalDocsMenu';

const ICON_MAP = { Globe, Building2, Network, Plug, Boxes, Briefcase, Cloud };

const STATUS_MAP = {
  connected:      { icon: CheckCircle2, tone: 'text-success bg-success-soft border-success/20',   label: 'Connected' },
  error:          { icon: XCircle,      tone: 'text-danger bg-danger-soft border-danger/20',       label: 'Error' },
  disconnected:   { icon: AlertCircle,  tone: 'text-warning bg-warning-soft border-warning/20',    label: 'Disconnected' },
  not_configured: { icon: AlertCircle,  tone: 'text-ink-3 bg-surface-2 border-line-1',             label: 'Not configured' },
};

export default function PortalDetailHeader({ portal, onToggleActive }) {
  const Icon = ICON_MAP[portal.icon] || Globe;
  const status = STATUS_MAP[portal.connection_status || 'not_configured'];
  const StatusIcon = status.icon;

  return (
    <header className="mb-6">
      <Link
        to="/portals"
        className="inline-flex items-center gap-1.5 text-[12px] text-ink-3 hover:text-ink-1 transition-colors duration-tab mb-4"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> All connectors
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-xl bg-accent flex items-center justify-center shadow-sm">
            <Icon className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-[22px] font-semibold tracking-tight text-ink-1">{portal.name}</h1>
              <span className="text-[10px] font-mono uppercase tracking-wider text-ink-4">{portal.key}</span>
            </div>
            <p className="text-[13px] text-ink-3 mt-1 italic-editorial">
              {portal.description || 'No description'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          <PortalDocsMenu portal={portal} />
          <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-medium ${status.tone}`}>
            <StatusIcon className="w-3.5 h-3.5" />
            {status.label}
          </div>
          <div className="flex items-center gap-1.5 text-[12px] text-ink-3">
            <Switch checked={portal.is_active} onCheckedChange={onToggleActive} />
            <span>{portal.is_active ? 'Active' : 'Paused'}</span>
          </div>
        </div>
      </div>
    </header>
  );
}