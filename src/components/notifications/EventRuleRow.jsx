import { Pencil, Trash2, Bell, Mail } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { EM } from '@/lib/format';

// Compact row for one NotificationSetting. Same visual language as the
// existing email-rule row in the Notifications page so the two lists feel
// consistent — but the channel chips + delta gates make the post-accept
// nature of these rules legible at a glance.
export default function EventRuleRow({ setting, portalLabel, onToggle, onEdit, onDelete }) {
  const channels = setting.channels || [];
  const recipients = setting.recipients || [];
  const conds = setting.conditions || [];
  return (
    <div
      className={`bg-surface-1 border border-line-1 rounded-md p-4 hover-surface transition-opacity ${
        !setting.is_active ? 'opacity-50' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-[14px] text-ink-1">{setting.name}</span>
            <span className="text-[10px] font-mono uppercase tracking-wider text-ink-4">
              {portalLabel(setting.portal)}
            </span>
            <span className="text-[10px] font-mono uppercase tracking-wider text-ink-4">
              {setting.trigger}
            </span>
          </div>

          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            {channels.includes('in_app') && (
              <span className="inline-flex items-center gap-1 text-[11px] bg-surface-2 text-ink-2 px-2 py-0.5 rounded">
                <Bell className="w-3 h-3" /> in-app
              </span>
            )}
            {channels.includes('email') && (
              <span className="inline-flex items-center gap-1 text-[11px] bg-accent-soft text-accent-ink px-2 py-0.5 rounded">
                <Mail className="w-3 h-3" /> email
              </span>
            )}
            {channels.includes('email') && recipients.map((r, i) => (
              <span key={i} className="text-[11px] text-ink-2 bg-surface-2 px-2 py-0.5 rounded">
                {r}
              </span>
            ))}
          </div>

          {/* Gates row — only show what's actually configured to avoid noise. */}
          {(setting.only_earlier || (setting.min_delta_minutes || 0) > 0) && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {setting.only_earlier && (
                <span className="text-[11px] text-warning bg-warning-soft px-2 py-0.5 rounded">
                  only earlier
                </span>
              )}
              {(setting.min_delta_minutes || 0) > 0 && (
                <span className="text-[11px] text-ink-2 bg-surface-2 px-2 py-0.5 rounded">
                  ≥ {setting.min_delta_minutes} min change
                </span>
              )}
            </div>
          )}

          {conds.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {conds.map((c, i) => (
                <span key={i} className="text-[11px] text-ink-2 bg-surface-2 px-2 py-0.5 rounded">
                  <span className="font-mono text-ink-3">{c.field}</span>
                  <span className="mx-1 text-ink-4">{c.operator}</span>
                  <span className="font-medium">{c.value || EM}</span>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-[12px] text-ink-3 italic-editorial mt-1.5">
              No conditions — fires for every change that passes the gates.
            </p>
          )}
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <Switch checked={setting.is_active} onCheckedChange={onToggle} />
          <button
            onClick={onEdit}
            className="inline-flex items-center justify-center h-8 w-8 rounded text-ink-3 hover:bg-surface-2 hover:text-ink-1 transition-colors duration-tab"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="inline-flex items-center justify-center h-8 w-8 rounded text-ink-3 hover:bg-danger-soft hover:text-danger transition-colors duration-tab"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}