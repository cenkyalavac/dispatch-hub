import { Radio } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

// GlobalLink lives behind a Railway-hosted Chromium broker. If the broker
// container dies, OIDC session expires, or page-context drifts, every
// /proxy/pd call silently fails — and the operator only notices hours later
// when no new offers appear.
//
// `last_sync_at` is the heartbeat: globallinkPoll cron stamps it every time
// the broker actually returns submissions. Stale heartbeat = broker is down
// or the cron itself crashed.
//
// Thresholds tuned for a 5-minute poll cadence:
//   ≤ 15 min  → live    (1-3 successful polls within the window)
//   ≤ 60 min  → stale   (≥3 missed polls — worth investigating)
//   > 60 min  → offline (≥12 missed polls — definitely broken)
export default function BrokerHealthBadge({ lastSyncAt }) {
  const now = Date.now();
  const last = lastSyncAt ? new Date(lastSyncAt).getTime() : 0;
  const ageMin = last ? (now - last) / 60000 : Infinity;

  let tone, label;
  if (ageMin <= 15) {
    tone = 'bg-success-soft text-success border-success/20';
    label = 'Broker live';
  } else if (ageMin <= 60) {
    tone = 'bg-warning-soft text-warning border-warning/30';
    label = 'Broker stale';
  } else {
    tone = 'bg-danger-soft text-danger border-danger/20';
    label = 'Broker offline';
  }

  const detail = lastSyncAt
    ? `synced ${formatDistanceToNow(new Date(lastSyncAt), { addSuffix: true })}`
    : 'never synced';

  return (
    <span
      className={`inline-flex items-center gap-1.5 h-6 px-2 rounded border text-[11px] font-medium ${tone}`}
      title={`GlobalLink broker heartbeat — ${detail}`}
    >
      <Radio className="w-3 h-3" />
      {label} · <span className="font-normal opacity-80">{detail}</span>
    </span>
  );
}