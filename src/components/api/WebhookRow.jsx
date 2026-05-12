import { useState } from 'react';
import { format } from 'date-fns';
import { Webhook, Trash2, Power, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';

import WebhookHealth from './WebhookHealth';

export default function WebhookRow({ sub, deliveries = [], onToggle, onDelete }) {
  const qc = useQueryClient();
  const [retrying, setRetrying] = useState(false);

  // Most recent failed/retry delivery for this sub — the "Retry now" button targets that one.
  const retryCandidate = deliveries.find(
    d => d.subscription_id === sub.id && (d.status === 'retry_scheduled' || d.status === 'failed')
  );

  const retryNow = async () => {
    if (!retryCandidate) return;
    setRetrying(true);
    try {
      const r = await base44.functions.invoke('webhookRetry', { delivery_id: retryCandidate.id });
      if (r.data?.success) {
        if (r.data.result?.ok) toast.success('Delivery recovered');
        else toast.warning(`Still failing (attempt ${r.data.result?.attempt})`);
        qc.invalidateQueries({ queryKey: ['webhook-deliveries'] });
        qc.invalidateQueries({ queryKey: ['webhook-subs'] });
      } else toast.error(r.data?.error || 'Retry failed');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className={`bg-surface-1 border border-line-1 rounded-md p-4 ${!sub.is_active ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-4">
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
          <div className="mt-2">
            <WebhookHealth subscription={sub} deliveries={deliveries} />
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {retryCandidate && (
            <button
              onClick={retryNow}
              disabled={retrying}
              className="inline-flex items-center gap-1 h-7 px-2.5 rounded text-[11px] text-ink-1 hover:bg-accent hover:text-white transition-colors duration-tab disabled:opacity-40"
            >
              <RefreshCw className={`w-3 h-3 ${retrying ? 'animate-spin' : ''}`} /> Retry now
            </button>
          )}
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
    </div>
  );
}