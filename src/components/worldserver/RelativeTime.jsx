import { formatDistanceToNow } from 'date-fns';
import { parseWsDate } from '@/lib/worldserver';
import { EM } from '@/lib/format';

// Relative time with the absolute timestamp on hover.
export default function RelativeTime({ value, className = '' }) {
  const d = parseWsDate(value);
  if (!d) return <span className={className}>{EM}</span>;
  return (
    <span className={className} title={d.toLocaleString()}>
      {formatDistanceToNow(d, { addSuffix: true })}
    </span>
  );
}