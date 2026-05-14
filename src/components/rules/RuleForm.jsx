import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation } from '@tanstack/react-query';
import { Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import FormField from '@/components/ui/FormField';
import ConditionValueInput from '@/components/rules/ConditionValueInput';

const FIELDS = [
  { value: 'project_name', label: 'Project name' },
  { value: 'client_name', label: 'Client name' },
  { value: 'source_language', label: 'Source language' },
  { value: 'target_language', label: 'Target language' },
  { value: 'word_count', label: 'Word count' },
  { value: 'price', label: 'Price' },
];
const TEXT_OPS = [
  { value: 'contains', label: 'contains' },
  { value: 'not_contains', label: 'does not contain' },
  { value: 'equals', label: 'equals' },
  { value: 'starts_with', label: 'starts with' },
];
const NUM_OPS = [
  { value: 'greater_than', label: '>' },
  { value: 'less_than', label: '<' },
  { value: 'greater_equal', label: '≥' },
  { value: 'less_equal', label: '≤' },
  { value: 'equals', label: '=' },
];
const numericFields = ['word_count', 'price', 'quantity'];

const fieldCls = 'w-full h-9 px-3 rounded-md border border-line-1 bg-surface-1 text-[13px] outline-none placeholder:text-ink-4';
const selectSm = 'h-8 px-2 rounded border border-line-1 bg-surface-1 text-[12px] outline-none';

export default function RuleForm({ rule, portals = [], onClose }) {
  const [name, setName] = useState(rule?.name || '');
  const [portal, setPortal] = useState(rule?.portal || (portals[0]?.key || 'symfonie'));
  const [action, setAction] = useState(rule?.action || 'accept');
  const [priority, setPriority] = useState(rule?.priority || 1);
  const [conditions, setConditions] = useState(rule?.conditions || []);
  const [nameError, setNameError] = useState('');

  const saveMutation = useMutation({
    mutationFn: async (data) =>
      rule?.id ? base44.entities.Rule.update(rule.id, data) : base44.entities.Rule.create(data),
    onSuccess: () => { toast.success(rule?.id ? 'Rule updated' : 'Rule created'); onClose(); },
    onError: (err) => toast.error(err.message),
  });

  const addCondition = () => setConditions([...conditions, { field: 'project_name', operator: 'contains', value: '' }]);
  const updateCondition = (idx, key, val) => {
    setConditions(conditions.map((c, i) => {
      if (i !== idx) return c;
      const next = { ...c, [key]: val };
      if (key === 'field') next.operator = numericFields.includes(val) ? 'greater_than' : 'contains';
      return next;
    }));
  };
  const removeCondition = (idx) => setConditions(conditions.filter((_, i) => i !== idx));

  const handleSave = () => {
    if (!name.trim()) { setNameError('Required'); return; }
    setNameError('');
    saveMutation.mutate({ name, portal, action, priority: Number(priority), conditions, is_active: true });
  };

  return (
    <div className="bg-surface-1 border border-accent/30 rounded-md p-5 animate-slide-down">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[14px] font-semibold text-ink-1">{rule?.id ? 'Edit rule' : 'New rule'}</h2>
        <button onClick={onClose} className="inline-flex items-center justify-center h-7 w-7 rounded text-ink-3 hover:bg-surface-2 transition-colors duration-tab">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-3">
        <div className="col-span-2">
          <FormField label="Rule name" required error={nameError} htmlFor="rule-name">
            <input id="rule-name" className={fieldCls} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Accept Amazon EN→TR" />
          </FormField>
        </div>
        <FormField label="Priority" helper="Lower runs first">
          <input type="number" min={1} className={fieldCls} value={priority} onChange={e => setPriority(e.target.value)} />
        </FormField>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <FormField label="Portal">
          <select value={portal} onChange={e => setPortal(e.target.value)} className={fieldCls}>
            {portals.length > 0
              ? portals.map(p => <option key={p.key} value={p.key}>{p.name}</option>)
              : <option value="symfonie">Symfonie</option>}
          </select>
        </FormField>
        <FormField label="Action">
          <select value={action} onChange={e => setAction(e.target.value)} className={fieldCls}>
            <option value="accept">Accept</option>
            <option value="reject">Reject</option>
          </select>
        </FormField>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[12px] font-medium text-ink-2">Conditions <span className="italic-editorial text-ink-3 font-normal">— all must match</span></span>
          <button
            onClick={addCondition}
            className="inline-flex items-center gap-1 h-7 px-2 rounded text-[11px] font-medium text-accent-ink hover:bg-accent-soft transition-colors duration-tab"
          >
            <Plus className="w-3 h-3" /> Add
          </button>
        </div>

        {conditions.length === 0 && (
          <p className="text-[12px] text-ink-3 italic-editorial">No conditions — applies to every task.</p>
        )}

        <div className="space-y-2">
          {conditions.map((c, idx) => {
            const isNum = numericFields.includes(c.field);
            const ops = isNum ? NUM_OPS : TEXT_OPS;
            return (
              <div key={idx} className="flex items-center gap-2 bg-surface-2 rounded-md p-2 border border-line-1">
                <select className={`${selectSm} w-36`} value={c.field} onChange={e => updateCondition(idx, 'field', e.target.value)}>
                  {FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
                <select className={`${selectSm} w-32`} value={c.operator} onChange={e => updateCondition(idx, 'operator', e.target.value)}>
                  {ops.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <ConditionValueInput
                  portal={portal}
                  field={c.field}
                  value={c.value}
                  onChange={(v) => updateCondition(idx, 'value', v)}
                />
                <button onClick={() => removeCondition(idx)} className="inline-flex items-center justify-center h-7 w-7 rounded text-ink-3 hover:bg-danger-soft hover:text-danger transition-colors duration-tab">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex gap-2 mt-5">
        <button
          onClick={handleSave}
          disabled={saveMutation.isPending}
          className="inline-flex items-center justify-center h-9 px-4 rounded-md bg-accent text-white text-[13px] font-medium hover:bg-[var(--accent-hover)] transition-colors duration-tab disabled:opacity-40 flex-1"
        >
          {saveMutation.isPending ? 'Saving…' : 'Save rule'}
        </button>
        <button onClick={onClose} className="h-9 px-4 rounded-md border border-line-1 text-[13px] text-ink-2 hover:bg-surface-2 transition-colors duration-tab">
          Cancel
        </button>
      </div>
    </div>
  );
}