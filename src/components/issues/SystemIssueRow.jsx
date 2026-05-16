import { useState } from 'react';
import { formatDistanceToNow, format } from 'date-fns';
import { ChevronDown, ChevronUp, Check, AlertCircle, AlertTriangle, Mail, User as UserIcon } from 'lucide-react';

const TYPE_LABEL = {
  poll_failure:          'Poll failure',
  accept_persist_failure: 'Accept persist failure',
  broker_offline:        'Broker offline',
  cron_failure:          'Cron failure',
  info:                  'Info',
};

export default function SystemIssueRow({
  issue,
  busy,
  onResolve,
  selectable = false,
  selected = false,
  onToggleSelect,
  resolved = false,
}) {
  const [open, setOpen] = useState(false);
  const isCritical = issue.severity === 'critical';
  const SeverityIcon = isCritical ? AlertCircle : AlertTriangle;
  // colSpan must match SystemIssuesTable columns:
  //   open     → [select?] + chevron + severity + issue + last_seen + action  = 5 (+1 if selectable)
  //   resolved → chevron + severity + issue + resolved                         = 4
  const colSpan = (resolved ? 4 : 5) + (selectable ? 1 : 0);

  return (
    <>
      <tr className={`border-b border-line-1 last:border-0 transition-colors ${resolved ? 'opacity-70' : 'hover:bg-surface-2'}`}>
        {selectable && (
          <td className="px-3 py-2.5 w-8">
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleSelect?.(issue)}
              className="w-4 h-4 accent-[var(--accent)] cursor-pointer"
              aria-label={`Select ${issue.title}`}
            />
          </td>
        )}
        <td className="px-2 py-2.5 w-6 cursor-pointer" onClick={() => setOpen(o => !o)}>
          {open ? <ChevronUp className="w-3.5 h-3.5 text-ink-3" /> : <ChevronDown className="w-3.5 h-3.5 text-ink-3" />}
        </td>
        <td className="px-3 py-2.5 w-24">
          <span className={`inline-flex items-center gap-1 h-5 px-1.5 rounded text-[10px] font-medium border ${
            isCritical
              ? 'bg-danger-soft text-danger border-danger/30'
              : 'bg-warning-soft text-warning border-warning/30'
          }`}>
            <SeverityIcon className="w-2.5 h-2.5" />
            {issue.severity}
          </span>
        </td>
        <td className="px-3 py-2.5 cursor-pointer" onClick={() => setOpen(o => !o)}>
          <p className="text-[13px] font-medium text-ink-1 truncate max-w-[420px]" title={issue.title}>
            {issue.title}
          </p>
          <p className="text-[11px] text-ink-3 mt-0.5 flex items-center gap-2 flex-wrap">
            <span>{TYPE_LABEL[issue.type] || issue.type}</span>
            {issue.portal && <span className="font-mono">· {issue.portal}</span>}
            {issue.occurrence_count > 1 && (
              <span className="text-warning">· {issue.occurrence_count}× occurrences</span>
            )}
            {issue.emailed_at && (
              <span
                className="inline-flex items-center gap-0.5"
                title={`Emailed admins ${format(new Date(issue.emailed_at), 'dd MMM HH:mm')}`}
              >
                · <Mail className="w-2.5 h-2.5" />
              </span>
            )}
            {resolved && issue.resolved_by && (
              <span className="inline-flex items-center gap-0.5" title={`Resolved by ${issue.resolved_by}`}>
                · <UserIcon className="w-2.5 h-2.5" />
                <span className="font-mono">{issue.resolved_by === 'auto' ? 'auto' : issue.resolved_by.split('@')[0]}</span>
              </span>
            )}
          </p>
        </td>
        <td className="px-3 py-2.5 text-right text-[11px] text-ink-3 tabular-nums whitespace-nowrap">
          {resolved
            ? (issue.resolved_at ? formatDistanceToNow(new Date(issue.resolved_at), { addSuffix: true }) : '—')
            : (issue.last_seen_at ? formatDistanceToNow(new Date(issue.last_seen_at), { addSuffix: true }) : '—')}
        </td>
        {!resolved && (
          <td className="px-3 py-2.5 text-right">
            <button
              onClick={() => onResolve(issue)}
              disabled={busy}
              className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-line-1 bg-surface-1 text-[11px] font-medium text-ink-1 hover:bg-success hover:text-white hover:border-success transition-colors duration-tab disabled:opacity-40"
            >
              <Check className="w-3 h-3" />
              Resolve
            </button>
          </td>
        )}
      </tr>
      {open && (
        <tr className="bg-surface-2 border-b border-line-1">
          <td colSpan={colSpan} className="px-5 py-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[12px] mb-3">
              {[
                ['Function',    issue.function_name],
                ['Reference',   issue.external_ref],
                ['Dedup key',   issue.dedup_key],
                ['First seen',  issue.first_seen_at ? format(new Date(issue.first_seen_at), 'dd MMM HH:mm') : null],
                ...(resolved ? [
                  ['Resolved at', issue.resolved_at ? format(new Date(issue.resolved_at), 'dd MMM HH:mm') : null],
                  ['Resolved by', issue.resolved_by],
                ] : []),
              ].filter(([, v]) => v).map(([k, v]) => (
                <div key={k}>
                  <p className="text-[10px] uppercase tracking-wider text-ink-3">{k}</p>
                  <p className="text-ink-1 mt-0.5 font-mono text-[12px] break-all">{String(v)}</p>
                </div>
              ))}
            </div>
            {issue.resolution_note && (
              <div className="mb-3">
                <p className="text-[10px] uppercase tracking-wider text-ink-3 mb-1">Resolution note</p>
                <p className="text-[12px] text-ink-2 italic-editorial">{issue.resolution_note}</p>
              </div>
            )}
            {issue.description && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-ink-3 mb-1">Detail</p>
                <pre className="text-[11px] font-mono text-ink-2 bg-surface-1 border border-line-1 rounded p-2 whitespace-pre-wrap break-all max-h-48 overflow-auto">
                  {issue.description}
                </pre>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}