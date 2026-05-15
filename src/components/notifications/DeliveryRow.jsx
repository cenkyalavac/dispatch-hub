import { CheckCircle2, AlertCircle, Mail, Clock } from 'lucide-react';

// Compact row showing one NotificationDelivery — recipient, status, task,
// time. Kept dumb (presentational only) so the page can swap data sources
// without touching this file.
const ICON_BY_OUTCOME = {
  sent:          { Icon: Mail,         color: 'text-ink-3' },
  accepted:      { Icon: CheckCircle2, color: 'text-success' },
  send_failed:   { Icon: AlertCircle,  color: 'text-danger' },
  accept_failed: { Icon: AlertCircle,  color: 'text-danger' },
  expired:       { Icon: Clock,        color: 'text-warning' },
};

const LABEL_BY_OUTCOME = {
  sent:          'Sent — awaiting click',
  accepted:      'Accepted',
  send_failed:   'Send failed',
  accept_failed: 'Accept failed',
  expired:       'Expired',
};

export default function DeliveryRow({ delivery }) {
  const { Icon, color } = ICON_BY_OUTCOME[delivery.outcome] || ICON_BY_OUTCOME.sent;
  const label = LABEL_BY_OUTCOME[delivery.outcome] || delivery.outcome;
  const when = delivery.consumed_at || delivery.sent_at;
  return (
    <div className="flex items-start gap-3 px-4 py-3 border-b border-line-1 last:border-b-0">
      <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${color}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[13px] text-ink-1 font-medium truncate">{delivery.task_name || delivery.task_id}</span>
          <span className="text-[10px] font-mono uppercase tracking-wider text-ink-4">{delivery.portal}</span>
        </div>
        <p className="text-[12px] text-ink-3 mt-0.5">
          {delivery.recipient} · {label}
          {delivery.rule_name && <span className="text-ink-4"> · via {delivery.rule_name}</span>}
        </p>
        {delivery.error && (
          <p className="text-[11px] text-danger mt-1 font-mono">{delivery.error}</p>
        )}
      </div>
      <span className="text-[11px] text-ink-4 tabular-nums flex-shrink-0">
        {when ? new Date(when).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
      </span>
    </div>
  );
}