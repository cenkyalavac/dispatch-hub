import { useMemo } from 'react';
import { CheckCircle2, AlertTriangle, AlertCircle } from 'lucide-react';

// Health from the last N deliveries for one subscription.
// Green   : 0 failures in the last 10 deliveries
// Yellow  : 1–2 failures, OR retries pending
// Red     : ≥3 failures in last 10, OR a permanently-failed delivery
export default function WebhookHealth({ subscription, deliveries }) {
  const stats = useMemo(() => {
    const own = deliveries
      .filter(d => d.subscription_id === subscription.id)
      .slice(0, 10);
    let success = 0, failed = 0, retrying = 0;
    for (const d of own) {
      if (d.status === 'success') success++;
      else if (d.status === 'failed') failed++;
      else if (d.status === 'retry_scheduled' || d.status === 'pending') retrying++;
    }
    const total = own.length;
    return { total, success, failed, retrying, deliveries: own };
  }, [deliveries, subscription.id]);

  if (stats.total === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-ink-3">
        <span className="w-1.5 h-1.5 rounded-full bg-ink-4" /> Never fired
      </span>
    );
  }

  const tone =
    stats.failed >= 3 ? 'red' :
    (stats.failed + stats.retrying) > 0 ? 'yellow' :
    'green';

  const Icon = tone === 'green' ? CheckCircle2 : tone === 'yellow' ? AlertTriangle : AlertCircle;
  const color = tone === 'green' ? 'text-success' : tone === 'yellow' ? 'text-warning' : 'text-danger';
  const label = tone === 'green' ? 'Healthy' : tone === 'yellow' ? 'Degraded' : 'Failing';

  return (
    <div className="flex items-center gap-3">
      <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${color}`}>
        <Icon className="w-3 h-3" /> {label}
      </span>
      {/* Sparkline-ish: last 10 attempts as dots, newest on the right */}
      <div className="flex items-center gap-0.5" title={`Last ${stats.total} deliveries`}>
        {[...stats.deliveries].reverse().map((d, i) => {
          const c =
            d.status === 'success' ? 'bg-success' :
            d.status === 'failed' ? 'bg-danger' :
            d.status === 'retry_scheduled' ? 'bg-warning' :
            'bg-ink-4';
          return <span key={d.id || i} className={`w-1.5 h-3 rounded-sm ${c}`} title={`${d.event} · ${d.status}`} />;
        })}
      </div>
      <span className="text-[11px] text-ink-3 tabular-nums">
        {stats.success}/{stats.total}
      </span>
    </div>
  );
}