import { Loader2 } from 'lucide-react';

// Status badge for a broker session. Colors per spec:
//   connected=green, needs_login/awaiting_sms=amber, logging_in=blue(spinner), error=red.
const META = {
  connected:    { label: 'Connected',    cls: 'bg-success-soft text-success' },
  needs_login:  { label: 'Needs login',  cls: 'bg-warning-soft text-warning' },
  awaiting_sms: { label: 'Awaiting SMS', cls: 'bg-warning-soft text-warning' },
  logging_in:   { label: 'Logging in',   cls: 'bg-accent-soft text-accent-ink', spin: true },
  error:        { label: 'Error',        cls: 'bg-danger-soft text-danger' },
};

export default function SessionStatusBadge({ status }) {
  const m = META[status] || { label: status || 'Unknown', cls: 'bg-surface-2 text-ink-3' };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium ${m.cls}`}>
      {m.spin && <Loader2 className="w-3 h-3 animate-spin" />}
      {m.label}
    </span>
  );
}