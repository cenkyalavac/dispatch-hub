import { useState } from 'react';
import { format } from 'date-fns';
import { CheckCircle2, ChevronDown, ChevronUp, Calendar, Clock, Layers } from 'lucide-react';
import { EM, fmtNumber } from '@/lib/format';

function FinanceRowsTable({ rows }) {
  if (!rows || rows.length === 0) {
    return <p className="text-[12px] text-ink-3 italic-editorial">No finance rows.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-md border border-line-1">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="bg-surface-2 border-b border-line-1 text-[10px] uppercase tracking-wider text-ink-3">
            <th className="text-left px-3 py-2 font-medium">Unit</th>
            <th className="text-right px-3 py-2 font-medium">Qty</th>
            <th className="text-right px-3 py-2 font-medium">Unit price</th>
            <th className="text-right px-3 py-2 font-medium">Min USD</th>
            <th className="text-right px-3 py-2 font-medium">Max USD</th>
            <th className="text-left px-3 py-2 font-medium">Name</th>
            <th className="text-center px-3 py-2 font-medium">✓</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-line-1 last:border-0">
              <td className="px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-ink-2">{r.billing_unit || EM}</td>
              <td className="px-3 py-2 text-right tabular-nums text-ink-2">{fmtNumber(r.quantity)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-ink-2">{r.unit_price_usd > 0 ? `$${r.unit_price_usd.toFixed(4)}` : EM}</td>
              <td className="px-3 py-2 text-right tabular-nums text-ink-3">{r.min_usd > 0 ? `$${r.min_usd.toFixed(2)}` : EM}</td>
              <td className="px-3 py-2 text-right tabular-nums font-medium text-ink-1">{r.max_usd > 0 ? `$${r.max_usd.toFixed(2)}` : EM}</td>
              <td className="px-3 py-2 text-ink-3 max-w-[150px] truncate">{r.name || EM}</td>
              <td className="px-3 py-2 text-center">{r.is_confirmed ? <span className="text-success">✓</span> : <span className="text-ink-4">{EM}</span>}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-surface-2 font-semibold border-t border-line-1">
            <td className="px-3 py-2 text-[10px] uppercase tracking-wider text-ink-3">Total</td>
            <td colSpan={2}></td>
            <td className="px-3 py-2 text-right tabular-nums text-ink-3">${rows.reduce((s, r) => s + (r.min_usd || 0), 0).toFixed(2)}</td>
            <td className="px-3 py-2 text-right tabular-nums text-accent">${rows.reduce((s, r) => s + (r.max_usd || 0), 0).toFixed(2)}</td>
            <td colSpan={2}></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export default function TaskDetailCard({ task, accepting, onAccept }) {
  const [expanded, setExpanded] = useState(false);
  const isOverdue = task.due_date && new Date(task.due_date) < new Date();

  return (
    <div className="bg-surface-1 border border-line-1 rounded-md hover-surface">
      <div className="flex items-start gap-4 p-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-[14px] text-ink-1 truncate">{task.name || EM}</span>
            {task.service_tag && <span className="text-[10px] uppercase tracking-wider text-ink-3 bg-surface-2 px-1.5 py-0.5 rounded">{task.service_tag}</span>}
            {task.workflow_name && <span className="text-[10px] uppercase tracking-wider text-accent-ink bg-accent-soft px-1.5 py-0.5 rounded">{task.workflow_name}</span>}
          </div>
          <p className="text-[12px] text-ink-3 mt-0.5 truncate italic-editorial">{task.project_name || EM}</p>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[12px]">
            {(task.source_language || task.target_language) && (
              <span className="font-mono text-ink-2 bg-surface-2 px-2 py-0.5 rounded">
                {task.source_language || EM} → {task.target_language || EM}
              </span>
            )}
            {task.word_count > 0 && (
              <span className="text-ink-3 inline-flex items-center gap-1">
                <Layers className="w-3 h-3" /> {fmtNumber(task.word_count)} words
              </span>
            )}
            {task.price_max_usd > 0 && (
              <span className="text-ink-1 font-semibold tabular-nums">
                ${task.price_max_usd.toFixed(2)}
                {task.price_min_usd > 0 && task.price_min_usd !== task.price_max_usd && (
                  <span className="font-normal text-ink-3 ml-1">(min ${task.price_min_usd.toFixed(2)})</span>
                )}
              </span>
            )}
            {task.due_date && (
              <span className={`inline-flex items-center gap-1 ${isOverdue ? 'text-danger font-medium' : 'text-ink-3'}`}>
                <Calendar className="w-3 h-3" />
                {format(new Date(task.due_date), 'dd MMM HH:mm')}
                {isOverdue && <span className="italic-editorial">overdue</span>}
              </span>
            )}
            {task.created_at && (
              <span className="text-ink-3 inline-flex items-center gap-1">
                <Clock className="w-3 h-3" /> {format(new Date(task.created_at), 'dd MMM')}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => setExpanded(!expanded)}
            className="inline-flex items-center gap-1 h-8 px-2.5 rounded text-[12px] text-ink-3 hover:bg-surface-2 hover:text-ink-1 transition-colors duration-tab"
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {expanded ? 'Hide' : 'Details'}
          </button>
          <button
            disabled={accepting}
            onClick={() => onAccept(task)}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-accent text-white text-[12px] font-medium hover:bg-[var(--accent-hover)] transition-colors duration-tab disabled:opacity-40"
          >
            {accepting ? <span className="skel w-3 h-3 rounded-full bg-white/50" /> : <CheckCircle2 className="w-3 h-3" />}
            Accept
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-line-1 px-4 pt-4 pb-4 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[12px]">
            <div><p className="text-[10px] uppercase tracking-wider text-ink-3">Task ID</p><p className="font-mono mt-0.5 text-ink-1">{task.id || EM}</p></div>
            <div><p className="text-[10px] uppercase tracking-wider text-ink-3">Type</p><p className="mt-0.5 text-ink-1">{task.task_type || EM}</p></div>
            <div><p className="text-[10px] uppercase tracking-wider text-ink-3">CAT</p><p className="mt-0.5 text-ink-1">{task.cat_tool || EM}</p></div>
            <div><p className="text-[10px] uppercase tracking-wider text-ink-3">Assigned</p><p className="mt-0.5 text-ink-1">{task.assigned_to || EM}</p></div>
            {task.updated_at && <div><p className="text-[10px] uppercase tracking-wider text-ink-3">Updated</p><p className="mt-0.5 text-ink-1 tabular-nums">{format(new Date(task.updated_at), 'dd MMM HH:mm')}</p></div>}
            {task.project_id && <div><p className="text-[10px] uppercase tracking-wider text-ink-3">Project ID</p><p className="font-mono mt-0.5 text-ink-1">{task.project_id}</p></div>}
          </div>

          {(task.description || task.instructions) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {task.description && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-ink-3 mb-1">Description</p>
                  <p className="text-[12px] bg-surface-2 border border-line-1 rounded p-2 leading-relaxed text-ink-2">{task.description}</p>
                </div>
              )}
              {task.instructions && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-ink-3 mb-1">Instructions</p>
                  <p className="text-[12px] bg-surface-2 border border-line-1 rounded p-2 leading-relaxed text-ink-2">{task.instructions}</p>
                </div>
              )}
            </div>
          )}

          <div>
            <p className="text-[10px] uppercase tracking-wider text-ink-3 mb-2">Finance rows</p>
            <FinanceRowsTable rows={task.finance_rows} />
          </div>
        </div>
      )}
    </div>
  );
}