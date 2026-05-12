import { format } from 'date-fns';
import { Webhook, Trash2, Power } from 'lucide-react';

export default function WebhookRow({ sub, onToggle, onDelete }) {
  return (
    <div className={`bg-surface-1 border border-line-1 rounded-md p-4 flex items-center gap-4 ${!sub.is_active ? 'opacity-60' : ''}`}>
      <div className="w-8 h-8 rounded-md bg-surface-2 flex items-center justify-center flex-shrink-0">
        <Webhook className="w-3.5 h-3.5 text-ink-3" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-[13px] font-semibold text-ink-1 truncate">{sub.name || 'Unnamed'}</p>
          <span className="text-[10px] uppercase tracking-wider bg-surface-2 text-ink-3 px-1.5 py-0.5 rounded">
            {sub.tenant_id || 'default'}
          </span>
          {!sub.is_active && (
            <span className="text-[10px] uppercase tracking-wider bg-warning-soft text-warning px-1.5 py-0.5 rounded">paused</span>
          )}
        </div>
        <p className="text-[11px] font-mono text-ink-3 truncate mt-0.5">{sub.url}</p>
        <p className="text-[11px] text-ink-3 italic-editorial mt-0.5">
          {(sub.events || []).join(', ') || 'all events'}
          {sub.last_delivered_at && (
            <> · last fired {format(new Date(sub.last_delivered_at), 'dd MMM HH:mm')} ({sub.last_status || '—'})</>
          )}
        </p>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onToggle(sub)}
          className="inline-flex items-center gap-1 h-7 px-2.5 rounded text-[11px] text-ink-3 hover:bg-surface-2 hover:text-ink-1 transition-colors duration-tab"
        >
          <Power className="w-3 h-3" /> {sub.is_active ? 'Pause' : 'Resume'}
        </button>
        <button
          onClick={() => onDelete(sub)}
          className="inline-flex items-center gap-1 h-7 px-2.5 rounded text-[11px] text-danger hover:bg-danger-soft transition-colors duration-tab"
        >
          <Trash2 className="w-3 h-3" /> Delete
        </button>
      </div>
    </div>
  );
}