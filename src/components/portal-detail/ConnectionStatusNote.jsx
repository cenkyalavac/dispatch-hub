import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ChevronDown, ChevronUp } from 'lucide-react';

// Surfaces the portal's connection_message in admin-friendly language.
// Most messages are short ("Authenticated as X", "JWT expires in 2 days"),
// but error states often carry a raw log snippet. We show a one-line summary
// and tuck the full technical detail behind a "Details" toggle so the header
// stays calm while the full message is one click away.
//
// Heuristic for "looks technical": long, or contains a stack/HTTP/JSON marker.
function looksTechnical(msg) {
  if (!msg) return false;
  if (msg.length > 90) return true;
  return /\b(error|exception|stack|http\s*\d{3}|\{|\}|at\s+\w+\.)/i.test(msg);
}

function summarize(msg) {
  if (!msg) return '';
  const firstLine = msg.split('\n')[0].trim();
  if (firstLine.length <= 90) return firstLine;
  return firstLine.slice(0, 87) + '…';
}

export default function ConnectionStatusNote({ portal, tone }) {
  const [open, setOpen] = useState(false);
  const message = portal.connection_message;
  const checkedAt = portal.last_checked_at;

  if (!message && !checkedAt) return null;

  const technical = looksTechnical(message);

  return (
    <div className="mt-2 flex items-center gap-2 flex-wrap text-[11px]">
      {message && (
        <span className={tone === 'error' ? 'text-danger' : 'text-ink-3'}>
          {summarize(message)}
        </span>
      )}
      {technical && (
        <button
          onClick={() => setOpen(o => !o)}
          className="inline-flex items-center gap-0.5 text-ink-3 hover:text-ink-1 transition-colors duration-tab"
        >
          {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          Details
        </button>
      )}
      {checkedAt && (
        <span className="text-ink-4 italic-editorial" title={new Date(checkedAt).toLocaleString()}>
          · checked {formatDistanceToNow(new Date(checkedAt), { addSuffix: true })}
        </span>
      )}
      {open && technical && (
        <pre className="w-full mt-1 text-[10px] font-mono text-ink-2 bg-surface-2 border border-line-1 rounded p-2 whitespace-pre-wrap break-all max-h-40 overflow-auto">
          {message}
        </pre>
      )}
    </div>
  );
}