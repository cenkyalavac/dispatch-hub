import { CheckCircle2, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { EM, fmtNumber } from '@/lib/format';

export default function ActivityRow({ task }) {
  const isAccepted = task.status === 'accepted';
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-surface-2 transition-colors duration-tab">
      {isAccepted
        ? <CheckCircle2 className="w-3.5 h-3.5 text-success flex-shrink-0" />
        : <XCircle className="w-3.5 h-3.5 text-danger flex-shrink-0" />}
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-ink-1 truncate">{task.task_name || EM}</p>
        <p className="text-[11px] text-ink-3 truncate">
          <span className="font-mono uppercase tracking-wider">{task.portal || EM}</span>
          {' · '}{task.source_language || EM} → {task.target_language || EM}
          {task.project_name && <span> · {task.project_name}</span>}
        </p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-[12px] tabular-nums text-ink-2">{fmtNumber(task.word_count)}</p>
        <p className="text-[10px] text-ink-4 tabular-nums">
          {task.accepted_at ? format(new Date(task.accepted_at), 'dd MMM HH:mm') : EM}
        </p>
      </div>
    </div>
  );
}