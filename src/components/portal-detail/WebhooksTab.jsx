import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Copy, RefreshCw, Webhook, ExternalLink, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/ui/EmptyState';
import { format } from 'date-fns';

// Tells the user how to configure the connector to push real-time events into
// this hub, and shows the live tail of inbound webhook deliveries so they can
// confirm the wiring is healthy.
//
// Only Symfonie has a documented webhook contract today (Moravia Projects
// /api/help/webhooks). For other portals we show a clear "not supported" notice
// rather than a placeholder URL, so users don't waste time trying to wire up
// something that won't work.

const RECEIVER_BY_PORTAL = {
  symfonie: {
    fn: 'symfonieWebhookReceiver',
    docsUrl: 'https://projects.moravia.com/api/help/webhooks',
    events: ['TaskOrdered', 'TaskCanceled', 'TaskAssignmentChanged', 'TaskCompleted', 'TaskApproved'],
    setupNote:
      'In Symfonie, register a new webhook with the URL below. Symfonie will first send a "ping" — our receiver replies with the manifest of supported events. After that, configured events will arrive in real time.',
  },
};

const STATUS_ICON = {
  processed: { icon: CheckCircle2, cls: 'text-success' },
  received:  { icon: AlertCircle,  cls: 'text-ink-3'   },
  duplicate: { icon: AlertCircle,  cls: 'text-warning' },
  rejected:  { icon: XCircle,      cls: 'text-danger'  },
  error:     { icon: XCircle,      cls: 'text-danger'  },
};

function copyToClipboard(text, label) {
  navigator.clipboard.writeText(text)
    .then(() => toast.success(`${label} copied`))
    .catch(() => toast.error('Copy failed'));
}

export default function WebhooksTab({ portal }) {
  const config = RECEIVER_BY_PORTAL[portal.key];
  const [showHelp, setShowHelp] = useState(false);

  const { data: events = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['webhook-inbound', portal.key],
    queryFn: () => base44.entities.WebhookInbound.filter({ portal: portal.key }, '-received_at', 50),
    refetchInterval: 15_000, // light auto-refresh so users see new events arrive
    enabled: !!config,
  });

  if (!config) {
    return (
      <div className="max-w-3xl">
        <EmptyState
          title="No webhook support"
          body={`${portal.name} doesn't expose a documented webhook contract. Data syncs via polling instead — see the Settings tab for fetch_function configuration.`}
        />
      </div>
    );
  }

  // Receiver URL is the deployed backend function endpoint. Users get the exact
  // host from the Base44 dashboard → Code → Functions; here we show the path
  // template so they can assemble it once and reuse the secret as a query param.
  const urlTemplate = `https://<your-app>.base44.app/functions/${config.fn}?secret=<SYMFONIE_WEBHOOK_SECRET>`;
  const secretRef = '<SYMFONIE_WEBHOOK_SECRET>';

  return (
    <div className="space-y-5 max-w-3xl">
      <section className="bg-surface-1 border border-line-1 rounded-md p-5">
        <h3 className="text-[13px] font-semibold text-ink-1 mb-2 inline-flex items-center gap-1.5">
          <Webhook className="w-3.5 h-3.5 text-ink-3" /> Real-time webhook receiver
        </h3>
        <p className="text-[12px] text-ink-3 italic-editorial mb-4">
          {config.setupNote}
        </p>

        <div className="space-y-3">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-ink-3">Endpoint URL template</label>
            <div className="flex gap-2 mt-1">
              <code className="flex-1 text-[12px] font-mono bg-surface-2 border border-line-1 rounded px-3 py-2 text-ink-1 break-all">
                {urlTemplate}
              </code>
              <button
                onClick={() => copyToClipboard(urlTemplate, 'URL template')}
                className="inline-flex items-center justify-center w-9 h-9 rounded-md border border-line-1 bg-surface-1 hover:bg-surface-2 transition-colors duration-tab"
                title="Copy"
              >
                <Copy className="w-3.5 h-3.5 text-ink-2" />
              </button>
            </div>
            <p className="text-[11px] text-ink-3 mt-1.5">
              Replace <code className="font-mono">&lt;your-app&gt;</code> with your deployed app host, and
              {' '}<code className="font-mono">{secretRef}</code> with the value of the
              {' '}<code className="font-mono">SYMFONIE_WEBHOOK_SECRET</code> secret. The exact host is shown in
              {' '}Base44 dashboard → Code → Functions → <code className="font-mono">{config.fn}</code>.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowHelp(s => !s)}
            className="text-[12px] text-accent hover:underline"
          >
            {showHelp ? 'Hide' : 'Show'} subscribed events
          </button>
          {showHelp && (
            <ul className="text-[12px] text-ink-2 list-disc pl-5 space-y-0.5">
              {config.events.map(e => (
                <li key={e}><code className="font-mono">{e}</code></li>
              ))}
            </ul>
          )}

          <a
            href={config.docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[12px] text-accent hover:underline"
          >
            Provider webhook docs <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </section>

      <section className="bg-surface-1 border border-line-1 rounded-md p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[13px] font-semibold text-ink-1">Recent deliveries</h3>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-line-1 text-[12px] text-ink-2 hover:bg-surface-2 transition-colors duration-tab disabled:opacity-40"
          >
            <RefreshCw className={`w-3 h-3 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-12" />)}
          </div>
        ) : events.length === 0 ? (
          <p className="text-[12px] text-ink-3 italic-editorial">
            No webhook deliveries yet. Register the URL above in Symfonie and wait for the first event.
          </p>
        ) : (
          <div className="divide-y divide-line-1 -mx-2">
            {events.map(ev => {
              const meta = STATUS_ICON[ev.status] || STATUS_ICON.received;
              const Icon = meta.icon;
              return (
                <div key={ev.id} className="px-2 py-2 flex items-start gap-2.5 hover-surface rounded">
                  <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${meta.cls}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <code className="font-mono text-[12px] text-ink-1">{ev.event_type || '—'}</code>
                      {ev.task_id && (
                        <span className="text-[11px] text-ink-3">task <code className="font-mono">{ev.task_id}</code></span>
                      )}
                      <span className="text-[11px] text-ink-4 tabular-nums ml-auto">
                        {ev.received_at ? format(new Date(ev.received_at), 'MMM d HH:mm:ss') : '—'}
                      </span>
                    </div>
                    {ev.action_taken && (
                      <p className="text-[11px] text-ink-3 mt-0.5">{ev.action_taken}</p>
                    )}
                    {ev.error && (
                      <p className="text-[11px] text-danger mt-0.5 font-mono">{ev.error}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}