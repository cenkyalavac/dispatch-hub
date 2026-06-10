import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation } from '@tanstack/react-query';
import { Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import FormField from '@/components/ui/FormField';
import ConditionValueInput from '@/components/rules/ConditionValueInput';
import { getFieldsForPortal, OPERATOR_LABELS } from '@/lib/portal-fields';

// Portal-aware RuleForm. Field set, operator set, and value dropdowns all
// come from the portal's own vocabulary (Portal.rule_fields, falling back to
// lib/portal-fields defaults). Portal is fixed — no portal switcher.

const fieldCls = 'w-full h-9 px-3 rounded-md border border-line-1 bg-surface-1 text-[13px] outline-none placeholder:text-ink-4';
const selectSm = 'h-8 px-2 rounded border border-line-1 bg-surface-1 text-[12px] outline-none';

export default function DynamicRuleForm({ rule, portal, onClose, onSaved }) {
  const portalFields = getFieldsForPortal(portal);
  // When editing a rule whose conditions reference field names no longer in the
  // portal vocabulary (e.g. the user removed `workflow_name` from rule_fields
  // after a rule was created using it), inject those legacy field names so the
  // dropdown still shows them and the rule remains editable instead of silently
  // breaking. Legacy fields default to text + standard text operators.
  const legacyNames = new Set();
  (rule?.conditions || []).forEach((c) => {
    if (c?.field && !portalFields.some((f) => f.name === c.field)) legacyNames.add(c.field);
  });
  const fields = [
    ...portalFields,
    ...Array.from(legacyNames).map((name) => ({
      name,
      label: `${name} (legacy)`,
      type: 'string',
      operators: ['contains', 'not_contains', 'equals', 'starts_with'],
    })),
  ];
  const firstField = fields[0]?.name || 'project_name';
  const firstOp = fields[0]?.operators?.[0] || 'contains';

  const [name, setName] = useState(rule?.name || '');
  const [action, setAction] = useState(rule?.action || 'accept');
  const [priority, setPriority] = useState(rule?.priority || 1);
  const [conditions, setConditions] = useState(rule?.conditions || []);
  const [nameError, setNameError] = useState('');

  const saveMutation = useMutation({
    mutationFn: async (/** @type {Record<string, any>} */ data) =>
      rule?.id ? base44.entities.Rule.update(rule.id, data) : base44.entities.Rule.create(data),
    onSuccess: () => {
      toast.success(rule?.id ? 'Rule updated' : 'Rule created');
      onSaved?.();
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  const addCondition = () =>
    setConditions([...conditions, { field: firstField, operator: firstOp, value: '' }]);

  const updateCondition = (idx, key, val) => {
    setConditions(conditions.map((c, i) => {
      if (i !== idx) return c;
      const next = { ...c, [key]: val };
      // When field changes, snap operator to that field's first available op.
      if (key === 'field') {
        const newField = fields.find((f) => f.name === val);
        next.operator = newField?.operators?.[0] || 'contains';
      }
      return next;
    }));
  };
  const removeCondition = (idx) => setConditions(conditions.filter((_, i) => i !== idx));

  const handleSave = () => {
    if (!name.trim()) { setNameError('Required'); return; }
    setNameError('');
    saveMutation.mutate({
      name,
      portal: portal.key,
      action,
      priority: Number(priority),
      conditions,
      is_active: rule?.is_active ?? true,
    });
  };

  return (
    <div className="bg-surface-1 border border-accent/30 rounded-md p-5 animate-slide-down">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[14px] font-semibold text-ink-1">
          {rule?.id ? 'Edit rule' : 'New rule'}
          <span className="ml-2 text-[11px] font-mono uppercase tracking-wider text-ink-4">{portal.key}</span>
        </h2>
        <button onClick={onClose} className="inline-flex items-center justify-center h-7 w-7 rounded text-ink-3 hover:bg-surface-2 transition-colors duration-tab">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-3">
        <div className="col-span-2">
          <FormField label="Rule name" required error={nameError} htmlFor="rule-name">
            <input id="rule-name" className={fieldCls} value={name} onChange={(e) => setName(e.target.value)} placeholder={`e.g. Accept Amazon EN→TR`} />
          </FormField>
        </div>
        <FormField label="Priority" helper="Lower runs first">
          <input type="number" min={1} className={fieldCls} value={priority} onChange={(e) => setPriority(e.target.value)} />
        </FormField>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <FormField label="Action">
          <select value={action} onChange={(e) => setAction(e.target.value)} className={fieldCls}>
            <option value="accept">Accept</option>
            <option value="reject">Reject</option>
          </select>
        </FormField>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[12px] font-medium text-ink-2">
            Conditions <span className="italic-editorial text-ink-3 font-normal">— all must match</span>
          </span>
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
            const fieldDef = fields.find((f) => f.name === c.field);
            const ops = fieldDef?.operators || ['contains'];
            return (
              <div key={idx} className="flex items-center gap-2 bg-surface-2 rounded-md p-2 border border-line-1">
                <select className={`${selectSm} w-44`} value={c.field} onChange={(e) => updateCondition(idx, 'field', e.target.value)}>
                  {fields.map((f) => <option key={f.name} value={f.name}>{f.label}</option>)}
                </select>
                <select className={`${selectSm} w-32`} value={c.operator} onChange={(e) => updateCondition(idx, 'operator', e.target.value)}>
                  {ops.map((op) => <option key={op} value={op}>{OPERATOR_LABELS[op] || op}</option>)}
                </select>
                <ConditionValueInput
                  portal={portal.key}
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