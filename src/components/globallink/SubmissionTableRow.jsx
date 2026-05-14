// One row in the GlobalLink pending table. Renders the 8 leverage bands
// (combined fuzzy + Reps) + total WC + computed WWC + TR deadline.

import { Button } from '@/components/ui/button';
import { Loader2, Check, X } from 'lucide-react';
import { extractLeverage, formatTrDeadline } from '@/lib/leverage';

function num(n) {
  if (n == null || n === 0) return '0';
  return Number(n).toLocaleString();
}

function Cell({ value, dim }) {
  return (
    <td className={`px-2 py-2 text-right tabular-nums text-[12px] ${dim ? 'text-ink-3' : 'text-ink-1'}`}>
      {value}
    </td>
  );
}

export default function SubmissionTableRow({ row, onApprove, onSkip, busyAction }) {
  const isBusy = !!busyAction;
  const lev = extractLeverage(row);

  const cells = [
    lev.context, lev.match100, lev.rep,
    lev.f9599, lev.f8594, lev.f7584, lev.f5074,
    lev.no_match, lev.total, lev.wwc,
  ];

  return (
    <tr className="border-b border-line-1 hover:bg-surface-2/40">
      <td className="px-2 py-2 text-[12px] text-ink-2 whitespace-nowrap">{row.client_name || '—'}</td>
      <td className="px-2 py-2 text-[12px] font-mono text-ink-2 whitespace-nowrap">{row.submission_id || row.submission_ticket}</td>
      <td className="px-2 py-2 text-[12px] text-ink-1 max-w-[280px] truncate" title={row.submission_name}>
        {row.submission_name || '—'}
      </td>
      <td className="px-2 py-2 text-[12px] text-ink-2 whitespace-nowrap">{row.target_language || '—'}</td>

      {cells.map((v, i) => <Cell key={i} value={num(v)} dim={v === 0} />)}

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