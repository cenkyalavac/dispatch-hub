import { Link } from 'react-router-dom';
import { Clock, AlertTriangle, XCircle, Info, UserCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

// Compact row for one UserNotification. Visually mirrors DeliveryRow so the
// Inbox and Email-log tabs feel like the same surface. Clicking the row marks
// it read; if a link_url is present we navigate, otherwise we just dismiss
// the unread state in place.

const TYPE_ICON = {
  due_date_changed: Clock,
  task_canceled: XCircle,
  task_assignment_changed: UserCircle,
  info: Info,
};

const SEVERITY_STYLES = {
  info:    { icon: 'text-accent',  dot: 'bg-accent' },
  warning: { icon: 'text-warning', dot: 'bg-warning' },
  danger:  { icon: 'text-danger',  dot: 'bg-danger' },
};

export default function InboxRow({ n, onMarkRead }) {
  const Icon = TYPE_ICON[n.type] || (n.severity === 'danger' ? AlertTriangle : Info);
  const sev = SEVERITY_STYLES[n.severity] || SEVERITY_STYLES.info;
  const unread = !n.read_at;

  // Best-effort relative timestamp — server returns ISO strings; if parsing
  // fails we just hide the suffix rather than crash the row.
  let when = '';
  try {
    when = formatDistanceToNow(new Date(n.created_date), { addSuffix: true });
  } catch { /* noop */ }

  const handleClick = () => {
    if (unread) onMarkRead(n);
  };

  const Content = (
    <div
      onClick={handleClick}
      className={`flex items-start gap-3 px-4 py-3 border-b border-line-1 last:border-b-0 cursor-pointer hover-surface transition-colors ${
        unread ? 'bg-surface-1' : 'bg-surface-2/30'
      }`}
    >
      <div className="relative flex-shrink-0 mt-0.5">
        <Icon className={`w-4 h-4 ${sev.icon}`} />
        {unread && (
          <span className={`absolute -top-1 -right-1 w-2 h-2 rounded-full ${sev.dot}`} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-[13px] ${unread ? 'font-semibold text-ink-1' : 'font-medium text-ink-2'}`}>
            {n.title}
          </span>
          {n.portal && (
            <span className="text-[10px] font-mono uppercase tracking-wider text-ink-4">
              {n.portal}
            </span>
          )}
          {n.delta_label && (
            <span className="text-[11px] text-warning bg-warning-soft px-1.5 py-0.5 rounded">
              {n.delta_label}
            </span>
          )}
        </div>
        {n.body && (
          <p className="text-[12px] text-ink-3 mt-0.5 leading-snug">{n.body}</p>
        )}
      </div>
      {when && (
        <span className="text-[11px] text-ink-4 whitespace-nowrap flex-shrink-0 mt-0.5">
          {when}
        </span>
      )}
    </div>
  );

  return n.link_url ? <Link to={n.link_url}>{Content}</Link> : Content;
}