import { useState } from 'react';
import { formatDistanceToNow, format } from 'date-fns';
import { Clock, User, Lock, Briefcase, ExternalLink, ChevronDown, ChevronRight, Check, Loader2 } from 'lucide-react';
import { EM, fmtNumber } from '@/lib/format';
import SymfonieTaskDetail from '@/components/pending/SymfonieTaskDetail';
import JunctionTaskDetail from '@/components/pending/JunctionTaskDetail';

// Format USD compactly — Symfonie sometimes returns 0 (no SO yet), we then hide it.
function fmtMoney(v) {
  const n = Number(v);
  if (!n || !Number.isFinite(n)) return null;
  return n >= 1000
    ? `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`
    : `$${n.toFixed(0)}`;
}

function dueBadge(due) {
  if (!due) return null;
  const d = new Date(due);
  const ms = d.getTime() - Date.now();
  const overdue = ms < 0;
  const soon = !overdue && ms < 24 * 3600 * 1000;
  const tone = overdue
    ? 'bg-danger-soft text-danger'
    : soon
    ? 'bg-warning-soft text-[color:var(--warning)]'
    : 'bg-surface-2 text-ink-2';
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium tabular-nums ${tone}`}>
      <Clock className="w-2.5 h-2.5" />
      {overdue ? 'overdue ' : ''}
      {formatDistanceToNow(d, { addSuffix: !overdue })}
    </span>
  );
}

// Rich row for live-fetched portal tasks (Symfonie, Junction). GlobalLink uses
// its own narrower row in PendingTab (different entity, different field names).
//
// Expand toggle reveals a portal-specific detail panel:
//   Symfonie → leverage breakdown + finance + people + custom fields + attachments
//   Junction → notes/instructions + assets
export default function PendingTaskRow({ task, portalKey, onAccept, isAccepting }) {
  const [expanded, setExpanded] = useState(false);

  const name = task.name || task.task_name || EM;
  const src = task.source_language || EM;
  const tgt = task.target_language || EM;
  const wc = Number(task.word_count) || 0;
  const price = fmtMoney(task.price ?? task.price_max_usd);
  const account = task.account_name || task.client_name || '';
  const projectName = task.project_name || '';
  const projectCode = task.project_code || task.symfonie_code || '';
  const jobName = task.job_name || '';
  const workflow = task.workflow_name || task.workflow_group_name || '';
  const requestors = (task.requestors || []).slice(0, 2);
  const locked = task.lock_state && task.lock_state !== 'Unlocked';
  const orderDate = task.order_date || task.created_at;

  const symfonieLink = (portalKey === 'symfonie' && task.job_id && task.id)
    ? `https://projects.moravia.com/Jobs/Detail/${task.job_id}#task-${task.id}`
    : null;

  // Junction's detail panel needs the *task id* (not the offer id). For Symfonie
  // task.id is already the task id.
  const detailTaskId = portalKey === 'junction' ? task.task_id : task.id;

  return (
    <div>
      <div className="px-4 py-3 hover:bg-surface-2 transition-colors duration-tab">
        {/* Top line: title + headline metrics */}
        <div className="flex items-start gap-3">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="mt-0.5 text-ink-4 hover:text-ink-1 transition-colors flex-shrink-0"
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-[13px] font-semibold text-ink-1 truncate" title={name}>{name}</p>
              {locked && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-danger-soft text-danger">
                  <Lock className="w-2.5 h-2.5" /> {task.lock_state}
                </span>
              )}
              {symfonieLink && (
                <a
                  href={symfonieLink}
                  target="_blank"
                  rel="noreferrer"
                  className="text-ink-4 hover:text-accent transition-colors"
                  title="Open in Symfonie"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>

            {/* Account › Project › Job — the hierarchy that actually identifies a task */}
            {(account || projectName || jobName) && (
              <p className="text-[11px] text-ink-3 truncate mt-0.5">
                {account && <span>{account}</span>}
                {account && projectName && <span className="text-ink-4 mx-1">›</span>}
                {projectName && (
                  <span>
                    {projectName}
                    {projectCode && <span className="font-mono text-ink-4 ml-1">({projectCode})</span>}
                  </span>
                )}
                {(projectName || account) && jobName && <span className="text-ink-4 mx-1">›</span>}
                {jobName && <span className="text-ink-2">{jobName}</span>}
              </p>
            )}
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="flex flex-col items-end gap-0.5">
              <span className="text-[12px] font-medium text-ink-1 tabular-nums">{fmtNumber(wc)} w</span>
              {price && <span className="text-[11px] text-ink-3 tabular-nums">{price}</span>}
            </div>
            {onAccept && (
              <button
                onClick={(e) => { e.stopPropagation(); onAccept(task); }}
                disabled={isAccepting}
                className="inline-flex items-center gap-1 h-7 px-2.5 rounded text-[11px] font-medium bg-accent text-white hover:bg-[var(--accent-hover)] transition-colors duration-tab disabled:opacity-50"
              >
                {isAccepting ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Check className="w-3 h-3" />
                )}
                Accept
              </button>
            )}
          </div>
        </div>

        {/* Bottom line: lang pair, workflow, due, ordered */}
        <div className="mt-1.5 ml-6 flex items-center gap-2 flex-wrap text-[11px]">
          <span className="font-mono text-ink-2">{src} → {tgt}</span>
          {workflow && (
            <span className="inline-flex items-center gap-1 text-ink-3">
              <Briefcase className="w-2.5 h-2.5" /> {workflow}
            </span>
          )}
          {requestors.length > 0 && (
            <span className="inline-flex items-center gap-1 text-ink-3 truncate max-w-[200px]">
              <User className="w-2.5 h-2.5" /> {requestors.join(', ')}
            </span>
          )}
          <span className="ml-auto inline-flex items-center gap-2">
            {dueBadge(task.due_date)}
            {orderDate && (
              <span
                className="text-ink-4 tabular-nums"
                title={`Ordered ${format(new Date(orderDate), 'PPp')}`}
              >
                {formatDistanceToNow(new Date(orderDate), { addSuffix: true })}
              </span>
            )}
          </span>
        </div>
      </div>

      {/* Expandable detail — portal-specific component, lazy-mounted */}
      {expanded && portalKey === 'symfonie' && <SymfonieTaskDetail task={task} />}
      {expanded && portalKey === 'junction' && (
        <div className="px-4 py-4 bg-surface-2/40 border-t border-line-1">
          <JunctionTaskDetail taskId={detailTaskId} />
        </div>
      )}
    </div>
  );
}