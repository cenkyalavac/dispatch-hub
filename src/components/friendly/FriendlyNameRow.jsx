import { Trash2 } from 'lucide-react';

const TYPE_LABEL = {
  client: 'Client',
  account: 'Account',
  project: 'Project',
  workflow: 'Workflow',
};

export default function FriendlyNameRow({ item, onToggle, onDelete }) {
  return (
    <div className={`bg-surface-1 border border-line-1 rounded-md px-4 py-3 flex items-center gap-3 ${!item.is_active ? 'opacity-60' : ''}`}>
      <span className="text-[10px] uppercase tracking-wider bg-surface-2 text-ink-3 px-1.5 py-0.5 rounded">
        {item.portal === '*' ? 'any' : item.portal}
      </span>
      <span className="text-[11px] font-medium text-ink-2 min-w-[80px]">
        {TYPE_LABEL[item.type] || item.type}
      </span>
      <span className="text-[10px] text-ink-3 italic-editorial">
        by {item.match_by || 'name'}
      </span>
      <code className="text-[12px] font-mono text-ink-1 bg-surface-2 px-2 py-0.5 rounded truncate max-w-[260px]" title={item.source_value}>
        {item.source_value}
      </code>
      <span className="text-ink-3 text-[12px]">→</span>
      <code className="text-[12px] font-mono text-accent bg-accent-soft px-2 py-0.5 rounded">{item.display_name}</code>
      {item.notes && (
        <span className="text-[11px] text-ink-3 italic-editorial truncate flex-1">{item.notes}</span>
      )}
      <div className="ml-auto flex items-center gap-1">
        <button
          onClick={() => onToggle(item)}
          className="text-[11px] text-ink-3 hover:text-ink-1 transition-colors duration-tab px-2 py-1 rounded hover:bg-surface-2"
        >
          {item.is_active ? 'Disable' : 'Enable'}
        </button>
        <button
          onClick={() => onDelete(item)}
          className="inline-flex items-center gap-1 h-7 px-2 rounded text-[11px] text-danger hover:bg-danger-soft transition-colors duration-tab"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}