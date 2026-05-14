import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Check, X, ChevronDown, ChevronRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import LeveragePanel from './LeveragePanel';

export default function SubmissionRow({ row, onApprove, onSkip, onFetchLeverage, busyAction }) {
  const [expanded, setExpanded] = useState(false);

  const isBusy = !!busyAction;
  const isApproving = busyAction === 'approve';
  const isSkipping = busyAction === 'skip';

  return (
    <div className="border border-line-1 rounded-lg bg-surface-1 overflow-hidden">
      <div className="flex items-start gap-3 px-4 py-3">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-0.5 text-ink-3 hover:text-ink-1"
          aria-label="Toggle details"
        >
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-medium text-sm text-ink-1 truncate">{row.submission_name || `Submission ${row.submission_id || row.submission_ticket}`}</h3>
            <Badge variant="outline" className="text-[10px] font-mono">{row.submission_id || row.submission_ticket}</Badge>
            <Badge variant="outline" className="text-[10px]">{row.source_language || '?'} → {row.target_language || '?'}</Badge>
          </div>
          <div className="text-xs text-ink-3 mt-1 flex items-center gap-3 flex-wrap">
            {row.client_name && <span>{row.client_name}</span>}
            {row.word_count ? <span>{row.word_count.toLocaleString()} words</span> : null}
            {row.due_date && <span>Due {formatDistanceToNow(new Date(row.due_date), { addSuffix: true })}</span>}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onSkip(row)}
            disabled={isBusy}
            className="h-8 gap-1.5"
          >
            {isSkipping ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
            Skip
          </Button>
          <Button
            size="sm"
            onClick={() => onApprove(row)}
            disabled={isBusy}
            className="h-8 gap-1.5"
          >
            {isApproving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Accept
          </Button>
        </div>
      </div>

      {expanded && (
        <LeveragePanel
          row={row}
          onFetch={() => onFetchLeverage(row)}
        />
      )}
    </div>
  );
}