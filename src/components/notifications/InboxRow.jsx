import { Link } from 'react-router-dom';
import { Clock, AlertTriangle, Info, CheckCircle } from 'lucide-react';
import moment from 'moment';

// Single in-app notification row, rendered inside the inbox list. Click
// anywhere on an unread row to mark it read (and follow link_url if present).
// Read rows are dimmed but stay clickable.
//
// Type/severity → tiny iconography. We intentionally keep the icon palette
// quiet (line icons, semantic colors only) so the row reads as data, not as
// a banner.
const TYPE_ICONS = {
  due_date_changed: Clock,
  task_canceled: AlertTriangle,
  task_assignment_changed: Info,
  info: Info,
};

const SEVERITY_TONE = {
  danger: 'text-danger',
  warning: 'text-warning',
  info: 'text-ink-3',
};

export default function InboxRow({ n, onMarkRead }) {
  const Icon = TYPE_ICONS[n.type] || Info;
  const tone = SEVERITY_TONE[n.severity] || SEVERITY_TONE.info;
  const isRead = !!n.read_at;
  const when = n.created_date ? moment(n.created_date).fromNow() : '';

  // Mark-read on click. Wrap in a button only when there's no link, otherwise
  // use Link (semantic navigation) and fire the read mutation on click.
  const handleClick = () => {
    if (!isRead) onMarkRead(n);
  };

  const inner = (
    <div
      className={`flex items-start gap-3 px-4 py-3 border-b border-line-1 last:border-b-0 hover-surface transition-opacity ${
        isRead ? 'opacity-60' : ''
      }`}
    >
      <div className={`mt-0.5 flex-shrink-0 ${tone}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[13px] font-medium text-ink-1">{n.title}</span>
          {!isRead && <span className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />}
          {n.portal && (
            <span className="text-[10px] font-mono uppercase tracking-wider text-ink-4">{n.portal}</span>
          )}
        </div>
        {n.body && <p className="text-[12px] text-ink-3 mt-0.5 break-words">{n.body}</p>}
      </div>
      <div className="flex items-center gap-2 text-[11px] text-ink-4 flex-shrink-0 mt-0.5">
        <span>{when}</span>
        {isRead && <CheckCircle className="w-3 h-3 text-success" />}
      </div>
    </div>
  );

  // When the notification has a link_url, render as a Link so the row
  // navigates to the related task/project page. Otherwise render as a
  // button so it still toggles read state without leaving the page.
  if (n.link_url) {
    return (
      <Link to={n.link_url} onClick={handleClick} className="block">
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={handleClick} className="block w-full text-left">
      {inner}
    </button>
  );
}