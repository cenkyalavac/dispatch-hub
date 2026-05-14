// One row in the GlobalLink pending table. PD exposes only two leverage
// signals: total word count (submission-level) and WWC (per language).
// Fuzzy band breakdown is not available pre-claim on this account.

import { Button } from '@/components/ui/button';
import { Loader2, Check, X } from 'lucide-react';

function num(n) {
  if (n == null || n === 0) return '0';
  return Number(n).toLocaleString();
}

// dd.MM.yyyy HH:mm in Europe/Istanbul, from either ISO string or epoch ms.
function formatTrDeadline(input) {
  if (!input) return '—';
  const d = typeof input === 'number' ? new Date(input) : new Date(input);
  if (isNaN(d.getTime())) return '—';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Istanbul',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d);
  const get = (t) => parts.find(p => p.type === t)?.value || '';
  return `${get('day')}.${get('month')}.${get('year')} ${get('hour')}:${get('minute')}`;
}

export default function SubmissionTableRow({ row, onApprove, onSkip, busyAction }) {
  const isBusy = !!busyAction;

  return (
    <tr className="border-b border-line-1 hover:bg-surface-2/40">
      <td className="px-2 py-2 text-[12px] text-ink-2 whitespace-nowrap">{row.client_name || '—'}</td>
      <td className="px-2 py-2 text-[12px] font-mono text-ink-2 whitespace-nowrap">{row.submission_id || row.submission_ticket}</td>
      <td className="px-2 py-2 text-[12px] text-ink-1 max-w-[320px] truncate" title={row.submission_name}>
        {row.submission_name || '—'}
      </td>
      <td className="px-2 py-2 text-[12px] text-ink-2 whitespace-nowrap">{row.target_language || '—'}</td>
      <td className="px-2 py-2 text-[12px] text-ink-2 max-w-[200px] truncate" title={row.workflow_name}>
        {row.workflow_name || '—'}
      </td>
      <td className="px-2 py-2 text-right tabular-nums text-[12px] text-ink-1">{num(row.word_count)}</td>
      <td className="px-2 py-2 text-right tabular-nums text-[12px] text-ink-1">{num(row.weighted_wc)}</td>
      <td className="px-2 py-2 text-[12px] text-ink-2 whitespace-nowrap tabular-nums">
        {formatTrDeadline(row.deadline_at || row.due_date)}
      </td>

      <td className="px-2 py-2 whitespace-nowrap">
        <div className="flex items-center justify-end gap-1">
          <Button
            size="sm" variant="outline"
            onClick={() => onSkip(row)}
            disabled={isBusy}
            className="h-7 px-2 gap-1"
          >
            {busyAction === 'skip' ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
            Skip
          </Button>
          <Button
            size="sm"
            onClick={() => onApprove(row)}
            disabled={isBusy}
            className="h-7 px-2 gap-1"
          >
            {busyAction === 'approve' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
            Accept
          </Button>
        </div>
      </td>
    </tr>
  );
}