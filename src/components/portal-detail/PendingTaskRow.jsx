import { useState } from 'react';
import { formatDistanceToNow, format } from 'date-fns';
import { Clock, User, Lock, Briefcase, ExternalLink, ChevronDown, ChevronRight, Check, X, Loader2 } from 'lucide-react';
import { EM, fmtNumber } from '@/lib/format';
import { useFriendlyNames } from '@/lib/friendly';

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
// Row is portal-agnostic: it does NOT know about Symfonie or Junction internals.
// The caller (PendingTab) decides which detail component to render via
// `DetailComponent` — keeps connectors fully isolated from each other.
export default function PendingTaskRow({ task, portalKey, onAccept, isAccepting, onReject, isRejecting, DetailComponent }) {
  const [expanded, setExpanded] = useState(false);

  // Tag the task with its portal key so the friendly resolver can pick the
  // right portal-specific rumuz. PendingTab fetches don't always populate
  // `portal` on the raw row (each connector's get-tasks function shapes the
  // payload differently). We patch it here once — last assignment wins, so
  // we always override the task's own portal field with the row's portalKey.
  const taskWithPortal = { ...task, portal: portalKey };
  const { friendly } = useFriendlyNames();

  const name = task.name || task.task_name || EM;
  const src = task.source_language || EM;
  const tgt = task.target_language || EM;
  const wc = Number(task.word_count) || 0;
  const price = fmtMoney(task.price ?? task.price_max_usd);
  // Friendly versions for visible text; we keep the raw value in the title
  // attribute so power users can still see the upstream label on hover.
  //
  // Account vs client: portals differ. Symfonie has client_name only;
  // GlobalLink/Junction populate account_name. We try the account rumuz
  // first (more specific), then fall back to the client rumuz, then raw.
  const accountRaw = task.account_name || task.client_name || '';
  const accountFriendly = accountRaw
    ? (
        friendly({ ...taskWithPortal, account_name: accountRaw }, 'account')
        || friendly({ ...taskWithPortal, client_name: accountRaw }, 'client')
        || accountRaw
      )
    : '';
  const account = accountFriendly;
  const projectNameRaw = task.project_name || '';
  const projectName = projectNameRaw ? friendly(taskWithPortal, 'project') || projectNameRaw : '';
  const projectCode = task.project_code || task.symfonie_code || '';
  const jobName = task.job_name || '';
  const workflowRaw = task.workflow_name || task.workflow_group_name || '';
  const workflow = workflowRaw
    ? friendly({ ...taskWithPortal, workflow_name: workflowRaw }, 'workflow') || workflowRaw
    : '';
  const requestors = (task.requestors || []).slice(0, 2);
  const locked = task.lock_state && task.lock_state !== 'Unlocked';
  const orderDate = task.order_date || task.created_at;

  const symfonieLink = (portalKey === 'symfonie' && task.job_id && task.id)
    ? `https://projects.moravia.com/Jobs/Detail/${task.job_id}#task-${task.id}`
    : null;

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
                {account && <span title={accountRaw !== account ? accountRaw : undefined}>{account}</span>}
                {account && projectName && <span className="text-ink-4 mx-1">›</span>}
                {projectName && (
                  <span title={projectNameRaw !== projectName ? projectNameRaw : undefined}>
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
                disabled={isAccepting || isRejecting}
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
            {/* Reject button: only when the portal exposes a reject_function AND
                the offer is rejectable. Junction's /available pool offers carry
                `rejectable: false` (locked) — show a muted Lock badge instead
                so the user understands why the button is missing. */}
            {onReject && task.rejectable !== false && (
              <button
                onClick={(e) => { e.stopPropagation(); onReject(task); }}
                disabled={isAccepting || isRejecting}
                className="inline-flex items-center gap-1 h-7 px-2.5 rounded text-[11px] font-medium border border-line-1 bg-surface-1 text-ink-2 hover:bg-danger-soft hover:text-danger hover:border-danger/30 transition-colors duration-tab disabled:opacity-50"
              >
                {isRejecting ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <X className="w-3 h-3" />
                )}
                Reject
              </button>
            )}
            {onReject && task.rejectable === false && (
              <span
                className="inline-flex items-center gap-1 h-7 px-2 rounded text-[10px] text-ink-4 bg-surface-2"
                title="This offer cannot be manually rejected — Junction has locked it."
              >
                <Lock className="w-2.5 h-2.5" /> locked
              </span>
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

      {/* Expandable detail — caller supplies the portal-specific component */}
      {expanded && DetailComponent && <DetailComponent task={task} />}
    </div>
  );
}