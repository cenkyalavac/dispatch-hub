import SystemIssueRow from './SystemIssueRow';

// Compact table renderer for SystemIssue rows. Used twice on the Issues page:
// once for OPEN issues (with bulk-select + Resolve action) and once for the
// resolved history view (read-only).
export default function SystemIssuesTable({
  issues,
  selectable = false,
  selectedIds = new Set(),
  onToggleSelect,
  onToggleSelectAll,
  resolvingIds = new Set(),
  onResolve,
  resolved = false,
}) {
  return (
    <div className="bg-surface-1 border border-line-1 rounded-md overflow-hidden">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="bg-surface-2 border-b border-line-1 text-[10px] uppercase tracking-wider text-ink-3">
            {selectable && (
              <th className="px-3 py-2 w-8">
                <input
                  type="checkbox"
                  checked={issues.length > 0 && selectedIds.size === issues.length}
                  ref={el => { if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < issues.length; }}
                  onChange={onToggleSelectAll}
                  className="w-4 h-4 accent-[var(--accent)] cursor-pointer"
                  aria-label="Select all"
                />
              </th>
            )}
            <th className="px-2 py-2 w-6" />
            <th className="text-left px-3 py-2 font-medium w-24">Severity</th>
            <th className="text-left px-3 py-2 font-medium">Issue</th>
            <th className="text-right px-3 py-2 font-medium">{resolved ? 'Resolved' : 'Last seen'}</th>
            {!resolved && <th className="text-right px-3 py-2 font-medium">Action</th>}
          </tr>
        </thead>
        <tbody>
          {issues.map(i => (
            <SystemIssueRow
              key={i.id}
              issue={i}
              busy={resolvingIds.has(i.id)}
              onResolve={onResolve}
              selectable={selectable}
              selected={selectedIds.has(i.id)}
              onToggleSelect={onToggleSelect}
              resolved={resolved}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}