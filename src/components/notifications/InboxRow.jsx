import { Link } from 'react-router-dom';
import { Calendar, AlertCircle, Info, X } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const TYPE_ICON = {
  due_date_changed: Calendar,
  task_canceled: X,
  task_assignment_changed: AlertCircle,
  info: Info,
};

const SEVERITY_STYLE = {
  info: 'text-ink-3',
  warning: 'text-warning',
  danger: 'text-danger',
};

export default function InboxRow({ n, onMarkRead }) {
  const Icon = TYPE_ICON[n.type] || Info;
  const isUnread = !n.read_at;

  const timeAgo = (() => {
    try {
      return formatDistanceToNow(new Date(n.created_date), { addSuffix: true });
    } catch {
      return '';
    }
  })();

  const inner = (
    <>
      <div className={`mt-0.5 ${SEVERITY_STYLE[n.severity] || 'text-ink-3'}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-[13px] ${isUnread ? 'font-semibold text-ink-1' : 'font-medium text-ink-2'}`}>
            {n.title}
          </span>
          {isUnread && <span className="w-1.5 h-1.5 rounded-full bg-accent" />}
        </div>
        {n.body && (
          <p className="text-[12px] text-ink-3 mt-0.5 leading-snug">{n.body}</p>
        )}
        <span className="text-[11px] text-ink-4 italic-editorial">{timeAgo}</span>
      </div>
      {isUnread && (
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onMarkRead(n); }}
          className="text-[11px] text-ink-3 hover:text-ink-1 hover:bg-surface-2 transition-colors duration-tab px-2 py-1 rounded"
        >
          Mark read
        </button>
      )}
    </>
  );

  const className = `flex items-start gap-3 px-4 py-3 border-b border-line-1 last:border-b-0 ${isUnread ? 'bg-accent-soft/30' : 'bg-surface-1'} hover-surface transition-colors duration-tab`;

  if (n.link_url) {
    return (
      <Link to={n.link_url} className={className}>
        {inner}
      </Link>
    );
  }
  return <div className={className}>{inner}</div>;
}