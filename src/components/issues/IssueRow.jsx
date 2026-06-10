import { useState } from 'react';
import { format } from 'date-fns';
import { RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { EM } from '@/lib/format';

export default function IssueRow({ project, busy, onReset, selected, onToggleSelect }) {
  const [open, setOpen] = useState(false);
  const selectable = typeof onToggleSelect === 'function';

  return (
    <>
      <tr className={`border-b border-line-1 last:border-0 hover:bg-surface-2 transition-colors ${selected ? 'bg-accent-soft/40' : ''}`}>
        {selectable && (
          <td className="px-3 py-2.5 w-8" onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={!!selected}
              onChange={() => onToggleSelect(project)}
              className="w-4 h-4 accent-[var(--accent)] cursor-pointer"
              aria-label={`Select ${project.name}`}
            />
          </td>
        )}
        <td className="px-2 py-2.5 w-6 cursor-pointer" onClick={() => setOpen(o => !o)}>
          {open ? <ChevronUp className="w-3.5 h-3.5 text-ink-3" /> : <ChevronDown className="w-3.5 h-3.5 text-ink-3" />}
        </td>
        <td className="px-3 py-2.5">
          <p className="text-[13px] font-medium text-ink-1 truncate max-w-[260px]" title={project.name}>
            {project.name || EM}
          </p>
          <p className="text-[11px] text-ink-3 truncate max-w-[260px]" title={project.client_name}>
            {project.client_name || EM}
          </p>
        </td>
        <td className="px-3 py-2.5 font-mono text-[11px] text-ink-2">{project.portal}</td>
        <td className="px-3 py-2.5">
          <p className="text-[12px] text-danger line-clamp-2 max-w-[360px]" title={project.sync_error}>
            {project.sync_error || <span className="italic-editorial text-ink-3">No error message recorded</span>}
          </p>
        </td>
        <td className="px-3 py-2.5 text-right text-[11px] text-ink-3 tabular-nums">
          {project.accepted_at ? format(new Date(project.accepted_at), 'dd MMM HH:mm') : EM}
        </td>
        <td className="px-3 py-2.5 text-right">
          <button
            onClick={() => onReset(project)}
            disabled={busy}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-line-1 bg-surface-1 text-[11px] font-medium text-ink-1 hover:bg-accent hover:text-white hover:border-accent transition-colors duration-tab disabled:opacity-40"
          >
            {busy ? <RefreshCw className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            Reset
          </button>
        </td>
      </tr>
      {open && (
        <tr className="bg-surface-2 border-b border-line-1">
          <td colSpan={selectable ? 7 : 6} className="px-5 py-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[12px]">
              {[
                ['Project ID',  project.id],
                ['External',    project.external_id],
                ['Languages',   project.source_language && project.target_language ? `${project.source_language} → ${project.target_language}` : null],
                ['Words',       project.word_count],
                ['Price',       project.price ? `${(project.currency || 'USD')} ${project.price}` : null],
                ['Due',         project.due_date ? format(new Date(project.due_date), 'dd MMM HH:mm') : null],
                ['Accepted',    project.accepted_at ? format(new Date(project.accepted_at), 'dd MMM HH:mm') : null],
                ['Acked by',    project.acknowledged_by],
              ].filter(([, v]) => v !== null && v !== '' && v !== undefined).map(([k, v]) => (
                <div key={k}>
                  <p className="text-[10px] uppercase tracking-wider text-ink-3">{k}</p>
                  <p className="text-ink-1 mt-0.5 font-mono text-[12px] break-all">{String(v)}</p>
                </div>
              ))}
            </div>
            {project.sync_error && (
              <div className="mt-3">
                <p className="text-[10px] uppercase tracking-wider text-ink-3 mb-1">Full error</p>
                <pre className="text-[11px] font-mono text-danger bg-surface-1 border border-line-1 rounded p-2 whitespace-pre-wrap break-all max-h-32 overflow-auto">
                  {project.sync_error}
                </pre>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}