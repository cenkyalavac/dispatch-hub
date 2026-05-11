import { Card, CardContent } from '@/components/ui/card';

const TONE_MAP = {
  default:  'from-slate-50 to-white border-slate-200',
  primary:  'from-blue-50 to-white border-blue-100',
  success:  'from-emerald-50 to-white border-emerald-100',
  danger:   'from-rose-50 to-white border-rose-100',
  warning:  'from-amber-50 to-white border-amber-100',
  purple:   'from-purple-50 to-white border-purple-100',
};

const ICON_TONE_MAP = {
  default: 'bg-slate-100 text-slate-600',
  primary: 'bg-blue-100 text-blue-600',
  success: 'bg-emerald-100 text-emerald-600',
  danger:  'bg-rose-100 text-rose-600',
  warning: 'bg-amber-100 text-amber-600',
  purple:  'bg-purple-100 text-purple-600',
};

export default function StatCard({ title, value, icon: Icon, sub, tone = 'default', trend }) {
  return (
    <Card className={`bg-gradient-to-br ${TONE_MAP[tone]} shadow-sm`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{title}</p>
            <p className="text-3xl font-bold text-foreground mt-1.5 tabular-nums">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1.5">{sub}</p>}
            {trend && (
              <div className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600">
                {trend}
              </div>
            )}
          </div>
          {Icon && (
            <div className={`p-2.5 rounded-xl ${ICON_TONE_MAP[tone]} flex-shrink-0`}>
              <Icon className="w-4 h-4" />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}