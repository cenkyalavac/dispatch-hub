// One row in the GlobalLink pending table. Renders the 12-band leverage cells
// when available; if not, shows a "Fetch" inline action. Auto-fetch (first N
// rows on page load) is orchestrated by the parent page — this row just
// renders state.

import { Button } from '@/components/ui/button';
import { Loader2, Check, X, Download } from 'lucide-react';
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

export default function SubmissionTableRow({ row, onApprove, onSkip, onFetchLeverage, busyAction, leverageBusy }) {
  const isBusy = !!busyAction;
  const isUnavailable = row.leverage && row.leverage._unavailable;
  const lev = isUnavailable ? null : extractLeverage(row.leverage);

  // Leverage cells — show '—' until data arrives.
  const cells = lev
    ? [lev.context, lev.match100, lev.rep, lev.f9599, lev.f8594, lev.f7584, lev.f5074, lev.noMatch, lev.totalWc]
    : null;

  return (
    <tr className="border-b border-line-1 hover:bg-surface-2/40">
      <td className="px-2 py-2 text-[12px] text-ink-2 whitespace-nowrap">{row.client_name || '—'}</td>
      <td className="px-2 py-2 text-[12px] font-mono text-ink-2 whitespace-nowrap">{row.submission_id || row.submission_ticket}</td>
      <td className="px-2 py-2 text-[12px] text-ink-1 max-w-[320px] truncate" title={row.submission_name}>
        {row.submission_name || '—'}
      </td>

      {cells ? (
        cells.map((v, i) => <Cell key={i} value={num(v)} dim={v === 0} />)
      ) : isUnavailable ? (
        <td className="px-2 py-2 text-[11px] text-ink-3 italic-editorial" colSpan={9} title="TransPerfect doesn't expose 12-band TM stats until the submission is claimed.">
          Fuzzy breakdown unavailable pre-claim — total WC: <span className="not-italic font-mono text-ink-2">{num(row.word_count)}</span>
        </td>
      ) : (
        <td className="px-2 py-2 text-[12px] text-ink-3" colSpan={9}>
          {leverageBusy ? (
            <span className="inline-flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> loading…</span>
          ) : (
            <button
              onClick={() => onFetchLeverage(row)}
              className="inline-flex items-center gap-1 text-ink-2 hover:text-ink-1 underline-offset-2 hover:underline"
            >
              <Download className="w-3 h-3" /> Fetch leverage
            </button>
          )}
        </td>
      )}

      <td className="px-2 py-2 text-[12px] text-ink-2 whitespace-nowrap tabular-nums">
        {formatTrDeadline(row.due_date)}
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