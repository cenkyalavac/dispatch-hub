import { useState } from 'react';
import { format } from 'date-fns';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { EM } from '@/lib/format';

export default function HistoryRow({ task }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <tr
        className="border-b border-line-1 last:border-0 hover:bg-surface-2 transition-colors cursor-pointer"
        onClick={() => setOpen(o => !o)}
      >
        <td className="px-2 py-2 text-ink-3 w-6">
          {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </td>
        <td className="px-3 py-2 text-ink-1 max-w-[260px] truncate" title={task.name}>{task.name || EM}</td>
        <td className="px-3 py-2 text-ink-2 max-w-[200px] truncate" title={task.project_name}>
          {task.project_name || EM}
          {task.account_code && <span className="ml-1.5 font-mono text-[10px] text-ink-4">{task.account_code}</span>}
        </td>
        <td className="px-3 py-2 font-mono text-ink-2">
          {task.source_language || EM}→{task.target_language || EM}
        </td>
        <td className="px-3 py-2 text-ink-3">{task.workflow_name || EM}</td>
        <td className="px-3 py-2">
          <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${
            task.state === 'Approved' ? 'bg-success-soft text-success' : 'bg-accent-soft text-accent-ink'
          }`}>{task.state}</span>
        </td>
        <td className="px-3 py-2 text-right text-ink-3 tabular-nums">
          {task.updated_at ? format(new Date(task.updated_at), 'dd MMM HH:mm') : EM}
        </td>
      </tr>
      {open && (
        <tr className="bg-surface-2 border-b border-line-1">
          <td colSpan={7} className="px-5 py-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[12px]">
              {[
                ['Task ID',       task.id],
                ['Service tag',   task.service_tag],
                ['Completed',     task.completed_date ? format(new Date(task.completed_date), 'dd MMM HH:mm') : null],
                ['Approved',      task.approve_date   ? format(new Date(task.approve_date), 'dd MMM HH:mm')   : null],
                ['Due',           task.due_date       ? format(new Date(task.due_date), 'dd MMM HH:mm')       : null],
                ['Created',       task.created_at     ? format(new Date(task.created_at), 'dd MMM HH:mm')     : null],
                ['Updated',       task.updated_at     ? format(new Date(task.updated_at), 'dd MMM HH:mm')     : null],
                ['Account code',  task.account_code],
              ].filter(([, v]) => v !== null && v !== '' && v !== undefined).map(([k, v]) => (
                <div key={k}>
                  <p className="text-[10px] uppercase tracking-wider text-ink-3">{k}</p>
                  <p className="text-ink-1 mt-0.5 font-mono text-[12px]">{String(v)}</p>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}