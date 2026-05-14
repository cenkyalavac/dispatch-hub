import { useState, useMemo } from 'react';
import { format, isValid } from 'date-fns';
import { CheckCircle2, ChevronDown, ChevronUp, Calendar, Clock, Layers } from 'lucide-react';
import { EM, fmtNumber } from '@/lib/format';

// Safe date formatter — returns null if the value is missing or invalid,
// preventing "RangeError: Invalid time value" from date-fns format().
function safeFormat(value, pattern) {
  if (!value) return null;
  const d = new Date(value);
  return isValid(d) ? format(d, pattern) : null;
}

function FinanceRowsTable({ rows }) {
  // Compute footer totals once per `rows` reference instead of twice per render.
  const totals = useMemo(() => {
    if (!rows) return { min: 0, max: 0 };
    let min = 0, max = 0;
    for (const r of rows) { min += r.min_usd || 0; max += r.max_usd || 0; }
    return { min, max };
  }, [rows]);

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
            <th className="text-left px-3 py-2 font-medium">PO #</th>
            <th className="text-left px-3 py-2 font-medium">Activity</th>
            <th className="text-left px-3 py-2 font-medium">Model</th>
            <th className="text-center px-3 py-2 font-medium">Flags</th>
            <th className="text-center px-3 py-2 font-medium">✓</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const po = r.purchase_order;
            return (
              <tr key={i} className="border-b border-line-1 last:border-0 align-top">
                <td className="px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-ink-2">{r.billing_unit || EM}</td>
                <td className="px-3 py-2 text-right tabular-nums text-ink-2">{fmtNumber(r.quantity)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-ink-2">{r.unit_price_usd > 0 ? `$${r.unit_price_usd.toFixed(4)}` : EM}</td>
                <td className="px-3 py-2 text-right tabular-nums text-ink-3">{r.min_usd > 0 ? `$${r.min_usd.toFixed(2)}` : EM}</td>
                <td className="px-3 py-2 text-right tabular-nums font-medium text-ink-1">{r.max_usd > 0 ? `$${r.max_usd.toFixed(2)}` : EM}</td>
                <td className="px-3 py-2 font-mono text-[11px] text-ink-2">{po?.po_number || EM}</td>
                <td className="px-3 py-2 font-mono text-[11px] text-ink-3">{po?.activity_no || EM}</td>
                <td className="px-3 py-2 text-ink-3 max-w-[140px] truncate" title={po?.model_name || ''}>{po?.model_name || EM}</td>
                <td className="px-3 py-2 text-center">
                  <div className="inline-flex gap-1 flex-wrap justify-center">
                    {po?.is_billable && <span className="text-[9px] uppercase tracking-wider bg-success-soft text-success px-1 py-0.5 rounded">Bill</span>}
                    {po?.is_proposal && <span className="text-[9px] uppercase tracking-wider bg-warning-soft text-warning px-1 py-0.5 rounded">Prop</span>}
                    {po?.is_rejected && <span className="text-[9px] uppercase tracking-wider bg-danger-soft text-danger px-1 py-0.5 rounded">Rej</span>}
                    {po?.discount > 0 && <span className="text-[9px] uppercase tracking-wider bg-surface-3 text-ink-2 px-1 py-0.5 rounded">−{po.discount}%</span>}
                    {!po && <span className="text-ink-4">{EM}</span>}
                  </div>
                </td>
                <td className="px-3 py-2 text-center">{r.is_confirmed ? <span className="text-success">✓</span> : <span className="text-ink-4">{EM}</span>}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="bg-surface-2 font-semibold border-t border-line-1">
            <td className="px-3 py-2 text-[10px] uppercase tracking-wider text-ink-3">Total</td>
            <td colSpan={2}></td>
            <td className="px-3 py-2 text-right tabular-nums text-ink-3">${totals.min.toFixed(2)}</td>
            <td className="px-3 py-2 text-right tabular-nums text-accent">${totals.max.toFixed(2)}</td>
            <td colSpan={5}></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function PoNumbersStrip({ rows }) {
  const pos = useMemo(
    () => [...new Set((rows || []).map(r => r.purchase_order?.po_number).filter(Boolean))],
    [rows]
  );
  if (pos.length === 0) return null;
  return (
    <div className="mt-2 flex items-center gap-2 flex-wrap text-[11px]">
      <span className="text-[10px] uppercase tracking-wider text-ink-3">PO numbers:</span>
      {pos.map(po => (
        <span key={po} className="font-mono bg-surface-2 border border-line-1 text-ink-2 px-1.5 py-0.5 rounded">{po}</span>
      ))}
    </div>
  );
}

export default function TaskDetailCard({ task, accepting, onAccept, selected, onToggleSelect }) {
  const [expanded, setExpanded] = useState(false);
  const dueDateStr = safeFormat(task.due_date, 'dd MMM HH:mm');
  const createdAtStr = safeFormat(task.created_at, 'dd MMM');
  const updatedAtStr = safeFormat(task.updated_at, 'dd MMM HH:mm');
  const isOverdue = dueDateStr && new Date(task.due_date) < new Date();
  const selectable = typeof onToggleSelect === 'function';

  return (
    <div className={`bg-surface-1 border rounded-md hover-surface transition-colors ${selected ? 'border-accent' : 'border-line-1'}`}>
      <div className="flex items-start gap-4 p-4">
        {selectable && (
          <input
            type="checkbox"
            checked={!!selected}
            onChange={() => onToggleSelect(task)}
            className="mt-1 w-4 h-4 accent-[var(--accent)] cursor-pointer flex-shrink-0"
            aria-label={`Select ${task.name}`}
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-[14px] text-ink-1 truncate">{task.name || EM}</span>
            {task.service_tag && <span className="text-[10px] uppercase tracking-wider text-ink-3 bg-surface-2 px-1.5 py-0.5 rounded">{task.service_tag}</span>}
            {task.workflow_name && <span className="text-[10px] uppercase tracking-wider text-accent-ink bg-accent-soft px-1.5 py-0.5 rounded">{task.workflow_name}</span>}
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-[12px] flex-wrap">
            {task.account_name && (
              <span className="font-medium text-ink-2">{task.account_name}</span>
            )}
            {task.account_name && task.project_name && <span className="text-ink-4">·</span>}
            {task.project_name && (
              <span className="italic-editorial text-ink-3 truncate">{task.project_name}</span>
            )}
            {task.project_code && (
              <span className="font-mono text-[10px] text-ink-4 bg-surface-2 px-1.5 py-0.5 rounded">{task.project_code}</span>
            )}
            {!task.account_name && !task.project_name && <span className="italic-editorial text-ink-4">{EM}</span>}
          </div>

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
            {dueDateStr && (
              <span className={`inline-flex items-center gap-1 ${isOverdue ? 'text-danger font-medium' : 'text-ink-3'}`}>
                <Calendar className="w-3 h-3" />
                {dueDateStr}
                {isOverdue && <span className="italic-editorial">overdue</span>}
              </span>
            )}
            {createdAtStr && (
              <span className="text-ink-3 inline-flex items-center gap-1">
                <Clock className="w-3 h-3" /> {createdAtStr}
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
            <div><p className="text-[10px] uppercase tracking-wider text-ink-3">State</p><p className="mt-0.5 text-ink-1">{task.state || EM}</p></div>
            <div><p className="text-[10px] uppercase tracking-wider text-ink-3">Position</p><p className="mt-0.5 text-ink-1 tabular-nums">{task.position ?? EM}</p></div>
            {task.account_name && <div><p className="text-[10px] uppercase tracking-wider text-ink-3">Account</p><p className="mt-0.5 text-ink-1 truncate" title={task.account_name}>{task.account_name}</p></div>}
            {task.account_code && <div><p className="text-[10px] uppercase tracking-wider text-ink-3">Account code</p><p className="font-mono mt-0.5 text-ink-1">{task.account_code}</p></div>}
            {task.project_id && <div><p className="text-[10px] uppercase tracking-wider text-ink-3">Project ID</p><p className="font-mono mt-0.5 text-ink-1">{task.project_id}</p></div>}
            {task.project_manager_id && <div><p className="text-[10px] uppercase tracking-wider text-ink-3">PM ID</p><p className="font-mono mt-0.5 text-ink-1">{task.project_manager_id}</p></div>}
            {task.job_id && <div><p className="text-[10px] uppercase tracking-wider text-ink-3">Job ID</p><p className="font-mono mt-0.5 text-ink-1">{task.job_id}</p></div>}
            {updatedAtStr && <div><p className="text-[10px] uppercase tracking-wider text-ink-3">Updated</p><p className="mt-0.5 text-ink-1 tabular-nums">{updatedAtStr}</p></div>}
          </div>

          {task.job_name && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-ink-3 mb-1">Job</p>
              <p className="text-[12px] text-ink-2 bg-surface-2 border border-line-1 rounded p-2 font-mono break-all">{task.job_name}</p>
            </div>
          )}

          {task.tags?.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-ink-3 mb-1.5">Tags</p>
              <div className="flex flex-wrap gap-1">
                {task.tags.map(tag => (
                  <span key={tag} className="text-[10px] font-mono text-ink-2 bg-surface-2 border border-line-1 px-1.5 py-0.5 rounded">{tag}</span>
                ))}
              </div>
            </div>
          )}

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
            <div className="flex items-baseline justify-between mb-2 flex-wrap gap-2">
              <p className="text-[10px] uppercase tracking-wider text-ink-3">Finance rows</p>
              {task.finance_rows?.length > 0 && (
                <div className="flex items-center gap-3 text-[11px] text-ink-3 tabular-nums">
                  <span>{task.finance_rows.length} row{task.finance_rows.length === 1 ? '' : 's'}</span>
                  {task.price_confirmed_usd > 0 && (
                    <span className="text-success">Confirmed ${task.price_confirmed_usd.toFixed(2)}</span>
                  )}
                  {task.finance_summary?.billable_rows > 0 && (
                    <span>Billable {task.finance_summary.billable_rows}</span>
                  )}
                  {task.finance_summary?.proposal_rows > 0 && (
                    <span className="text-warning">Proposal {task.finance_summary.proposal_rows}</span>
                  )}
                </div>
              )}
            </div>
            <FinanceRowsTable rows={task.finance_rows} />
            <PoNumbersStrip rows={task.finance_rows} />
          </div>
        </div>
      )}
    </div>
  );
}