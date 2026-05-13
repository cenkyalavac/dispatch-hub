import { Trash2, Plus, ChevronUp, ChevronDown } from 'lucide-react';

const FIELDS = [
  { v: 'project_name', l: 'Project name' },
  { v: 'task_name', l: 'Task name' },
  { v: 'client_name', l: 'Client' },
  { v: 'source_language', l: 'Source lang' },
  { v: 'target_language', l: 'Target lang' },
  { v: 'workflow_name', l: 'Workflow' },
  { v: 'word_count', l: 'Word count' },
  { v: 'price', l: 'Price' },
  { v: 'matched_rule', l: 'Matched rule' },
];

const OPERATORS = [
  { v: 'contains', l: 'contains' },
  { v: 'not_contains', l: 'does not contain' },
  { v: 'equals', l: 'equals' },
  { v: 'starts_with', l: 'starts with' },
  { v: 'in', l: 'in list (a,b,c)' },
  { v: 'greater_than', l: '>' },
  { v: 'less_than', l: '<' },
  { v: 'greater_equal', l: '≥' },
  { v: 'less_equal', l: '≤' },
];

const fieldCls = 'h-8 px-2 rounded-md border border-line-1 bg-surface-1 text-[12px] outline-none placeholder:text-ink-4';

// One row representing a single SheetRoute in the connector dialog.
export default function SheetRouteRow({ route, onChange, onRemove, onMove }) {
  const update = (k, v) => onChange({ ...route, [k]: v });
  const updateCond = (idx, k, v) => {
    const next = [...(route.conditions || [])];
    next[idx] = { ...next[idx], [k]: v };
    update('conditions', next);
  };
  const addCond = () => update('conditions', [...(route.conditions || []), { field: 'project_name', operator: 'contains', value: '' }]);
  const removeCond = (idx) => update('conditions', (route.conditions || []).filter((_, i) => i !== idx));

  return (
    <div className="border border-line-1 rounded-md bg-surface-2/40 p-3 space-y-2.5">
      <div className="flex items-center gap-2">
        <input
          className={`${fieldCls} flex-1`}
          value={route.name || ''}
          onChange={(e) => update('name', e.target.value)}
          placeholder="Route name (e.g. Amazon TR)"
        />
        <label className="inline-flex items-center gap-1 text-[11px] text-ink-3">
          <input
            type="checkbox"
            checked={route.is_active !== false}
            onChange={(e) => update('is_active', e.target.checked)}
          />
          Active
        </label>
        <div className="flex items-center">
          <button type="button" onClick={() => onMove(-1)} className="h-7 w-7 inline-flex items-center justify-center text-ink-3 hover:bg-surface-2 rounded">
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <button type="button" onClick={() => onMove(1)} className="h-7 w-7 inline-flex items-center justify-center text-ink-3 hover:bg-surface-2 rounded">
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          <button type="button" onClick={onRemove} className="h-7 w-7 inline-flex items-center justify-center text-danger hover:bg-danger-soft rounded">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_120px] gap-2">
        <input
          className={`${fieldCls} font-mono`}
          value={route.spreadsheet_id || ''}
          onChange={(e) => update('spreadsheet_id', e.target.value.trim())}
          placeholder="Spreadsheet ID"
        />
        <input
          className={fieldCls}
          value={route.tab_name || ''}
          onChange={(e) => update('tab_name', e.target.value)}
          placeholder="Tab (optional)"
        />
      </div>

      <div className="space-y-1.5">
        {(route.conditions || []).length === 0 && (
          <p className="text-[11px] text-ink-3 italic-editorial">No conditions — this route matches every task.</p>
        )}
        {(route.conditions || []).map((c, idx) => (
          <div key={idx} className="grid grid-cols-[140px_140px_1fr_28px] gap-1.5">
            <select className={fieldCls} value={c.field} onChange={(e) => updateCond(idx, 'field', e.target.value)}>
              {FIELDS.map(f => <option key={f.v} value={f.v}>{f.l}</option>)}
            </select>
            <select className={fieldCls} value={c.operator} onChange={(e) => updateCond(idx, 'operator', e.target.value)}>
              {OPERATORS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
            </select>
            <input
              className={fieldCls}
              value={c.value || ''}
              onChange={(e) => updateCond(idx, 'value', e.target.value)}
              placeholder={c.operator === 'in' ? 'tr, turkish, tr-tr' : 'value'}
            />
            <button type="button" onClick={() => removeCond(idx)} className="h-8 w-7 inline-flex items-center justify-center text-ink-3 hover:bg-surface-2 rounded">
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addCond}
          className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-dashed border-line-2 text-[11px] text-ink-2 hover:bg-surface-2 transition-colors duration-tab"
        >
          <Plus className="w-3 h-3" /> Add condition
        </button>
      </div>
    </div>
  );
}