import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  CheckCircle2, AlertCircle, XCircle, ArrowRight,
  Globe, Building2, Network, Plug, Boxes, Briefcase, Cloud,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const ICON_MAP = { Globe, Building2, Network, Plug, Boxes, Briefcase, Cloud };

const COLOR_MAP = {
  blue: 'bg-blue-500', purple: 'bg-purple-500', emerald: 'bg-emerald-500',
  amber: 'bg-amber-500', rose: 'bg-rose-500',
};

const STATUS_ICON = {
  connected:      <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
  error:          <XCircle className="w-4 h-4 text-red-500" />,
  disconnected:   <AlertCircle className="w-4 h-4 text-amber-500" />,
  not_configured: <AlertCircle className="w-4 h-4 text-slate-400" />,
};

export default function PortalStatusGrid({ portals = [], taskCounts = {} }) {
  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Plug className="w-4 h-4 text-muted-foreground" />
          Connected Portals
        </CardTitle>
        <Link to="/portals">
          <Button variant="ghost" size="sm" className="text-xs gap-1 h-7">
            Manage <ArrowRight className="w-3 h-3" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent className="space-y-2">
        {portals.length === 0 ? (
          <div className="text-center py-6 text-sm text-muted-foreground">
            No connectors yet. <Link to="/portals" className="text-primary hover:underline">Add one</Link>.
          </div>
        ) : portals.map(p => {
          const Icon = ICON_MAP[p.icon] || Globe;
          const count = taskCounts[p.key] || 0;
          return (
            <div key={p.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-secondary/50 transition-colors">
              <div className={`w-9 h-9 rounded-lg ${COLOR_MAP[p.color] || 'bg-slate-500'} flex items-center justify-center flex-shrink-0`}>
                <Icon className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium truncate">{p.name}</p>
                  {!p.is_active && <Badge variant="secondary" className="text-[10px]">Disabled</Badge>}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {STATUS_ICON[p.connection_status || 'not_configured']}
                  <span>
                    {p.last_checked_at
                      ? formatDistanceToNow(new Date(p.last_checked_at), { addSuffix: true })
                      : 'never tested'}
                  </span>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-lg font-bold tabular-nums">{count}</p>
                <p className="text-[10px] text-muted-foreground uppercase">processed</p>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}