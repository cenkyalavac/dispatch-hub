import { useState } from 'react';
import { Trash2, Pencil, Check, X } from 'lucide-react';

const TYPE_LABEL = {
  client: 'Client',
  account: 'Account',
  project: 'Project',
  workflow: 'Workflow',
};

export default function FriendlyNameRow({ item, onToggle, onDelete, onSave }) {
  const [editing, setEditing] = useState(false);
  const [sourceValue, setSourceValue] = useState(item.source_value || '');
  const [displayName, setDisplayName] = useState(item.display_name || '');
  const [notes, setNotes] = useState(item.notes || '');
  const [saving, setSaving] = useState(false);

  const startEdit = () => {
    setSourceValue(item.source_value || '');
    setDisplayName(item.display_name || '');
    setNotes(item.notes || '');
    setEditing(true);
  };

  const cancelEdit = () => setEditing(false);

  const submit = async () => {
    if (!sourceValue.trim() || !displayName.trim()) return;
    setSaving(true);
    try {
      await onSave(item, {
        source_value: sourceValue.trim(),
        display_name: displayName.trim(),
        notes: notes.trim(),
      });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'h-7 px-2 rounded border border-line-1 bg-surface-1 text-[12px] outline-none focus:border-accent';

  if (editing) {
    return (
      <div className="bg-surface-1 border border-accent rounded-md px-4 py-3 flex items-center gap-2 flex-wrap">
        <span className="text-[10px] uppercase tracking-wider bg-surface-2 text-ink-3 px-1.5 py-0.5 rounded">
          {item.portal === '*' ? 'any' : item.portal}
        </span>
        <span className="text-[11px] font-medium text-ink-2 min-w-[70px]">
          {TYPE_LABEL[item.type] || item.type}
        </span>
        <span className="text-[10px] text-ink-3 italic-editorial">
          by {item.match_by || 'name'}
        </span>
        <input
          value={sourceValue}
          onChange={(e) => setSourceValue(e.target.value)}
          placeholder="Source value"
          className={`${inputCls} font-mono w-[220px]`}
          autoFocus
        />
        <span className="text-ink-3 text-[12px]">→</span>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Display name"
          className={`${inputCls} font-mono w-[180px]`}
        />
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          className={`${inputCls} flex-1 min-w-[140px]`}
        />
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={submit}
            disabled={saving || !sourceValue.trim() || !displayName.trim()}
            className="inline-flex items-center gap-1 h-7 px-2 rounded text-[11px] text-accent hover:bg-accent-soft transition-colors duration-tab disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Check className="w-3 h-3" /> Save
          </button>
          <button
            onClick={cancelEdit}
            disabled={saving}
            className="inline-flex items-center gap-1 h-7 px-2 rounded text-[11px] text-ink-3 hover:bg-surface-2 transition-colors duration-tab"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>
    );
  }

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
          onClick={startEdit}
          className="inline-flex items-center gap-1 h-7 px-2 rounded text-[11px] text-ink-3 hover:text-ink-1 hover:bg-surface-2 transition-colors duration-tab"
        >
          <Pencil className="w-3 h-3" /> Edit
        </button>
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