import { Clock, AlertTriangle, XCircle } from 'lucide-react';

// Stateless badge for JWT-style connectors that store expiry info in connection_message.
// Reads a "JWT expires in N day(s)" tail; renders a tone-coded chip.
//   N <= 0       → critical (red)
//   N <= 7       → warning (amber)
//   N <= 14      → notice  (slate)
//   N > 14       → hidden (clean card)
export default function JwtExpiryBadge({ days }) {
  if (days === null || days === undefined || Number.isNaN(days)) return null;
  if (days > 14) return null;

  const expired = days <= 0;
  const warn = !expired && days <= 7;

  const Icon = expired ? XCircle : warn ? AlertTriangle : Clock;
  const tone = expired
    ? 'bg-red-50 border-red-200 text-red-700'
    : warn
      ? 'bg-amber-50 border-amber-200 text-amber-800'
      : 'bg-slate-50 border-slate-200 text-slate-600';

  const label = expired
    ? 'JWT expired — refresh now'
    : days === 1
      ? 'JWT expires tomorrow'
      : `JWT expires in ${days} days`;

  return (
    <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded border text-[11px] font-medium ${tone}`}>
      <Icon className="w-3 h-3" />
      {label}
    </div>
  );
}