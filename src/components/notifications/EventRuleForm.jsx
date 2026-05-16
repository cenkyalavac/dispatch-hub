import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation } from '@tanstack/react-query';
import { Plus, X, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import FormField from '@/components/ui/FormField';

// Mirror handleDueDateChange's evalCond — keep the option lists in sync so the
// form can never produce a rule the backend won't understand.
const FIELDS = [
  { v: 'project_name', l: 'Project name' },
  { v: 'task_name', l: 'Task name' },
  { v: 'workflow_name', l: 'Workflow' },
  { v: 'source_language', l: 'Source language' },
  { v: 'target_language', l: 'Target language' },
  { v: 'client_name', l: 'Client' },
  { v: 'word_count', l: 'Word count' },
  { v: 'price', l: 'Price' },
  { v: 'matched_rule', l: 'Matched auto-accept rule' },
];
const OPS = [
  { v: 'contains', l: 'contains' },
  { v: 'not_contains', l: 'does not contain' },
  { v: 'equals', l: 'equals' },
  { v: 'starts_with', l: 'starts with' },
  { v: 'greater_than', l: '>' },
  { v: 'less_than', l: '<' },
  { v: 'greater_equal', l: '≥' },
  { v: 'less_equal', l: '≤' },
];

// Empty form shell — used both for "new" and as a reset target after save.
const blank = {
  name: '',
  is_active: true,
  trigger: 'due_date_changed',
  portal: '*',
  channels: ['in_app', 'email'],
  recipients: [],
  min_delta_minutes: 0,
  only_earlier: false,
  conditions: [],
  email_subject_template: '',
  email_body_note: '',
};

export default function EventRuleForm({ rule, portals, onClose }) {
  const [form, setForm] = useState(rule ? { ...blank, ...rule } : blank);
  const [recipInput, setRecipInput] = useState('');

  const mutation = useMutation({
    mutationFn: (data) =>
      rule
        ? base44.entities.NotificationSetting.update(rule.id, data)
        : base44.entities.NotificationSetting.create(data),
    onSuccess: () => {
      toast.success(rule ? 'Rule updated' : 'Rule created');
      onClose();
    },
    onError: (e) => toast.error(e.message || 'Save failed'),
  });

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const toggleChannel = (ch) => {
    const has = form.channels.includes(ch);
    set({ channels: has ? form.channels.filter((c) => c !== ch) : [...form.channels, ch] });
  };

  const addRecipient = () => {
    const v = recipInput.trim();
    if (!v) return;
    if (form.recipients.includes(v)) return;
    set({ recipients: [...form.recipients, v] });
    setRecipInput('');
  };

  const removeRecipient = (r) => set({ recipients: form.recipients.filter((x) => x !== r) });

  const addCondition = () =>
    set({ conditions: [...form.conditions, { field: 'project_name', operator: 'contains', value: '' }] });

  const updateCondition = (i, patch) => {
    const next = [...form.conditions];
    next[i] = { ...next[i], ...patch };
    set({ conditions: next });
  };

  const removeCondition = (i) => set({ conditions: form.conditions.filter((_, idx) => idx !== i) });

  const submit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error('Name is required');
    if (form.channels.includes('email') && form.recipients.length === 0) {
      return toast.error('Add at least one email recipient (or use the "admins" token)');
    }
    mutation.mutate(form);
  };

  return (
    <form
      onSubmit={submit}
      className="bg-surface-1 border border-line-1 rounded-md p-5 space-y-5 animate-slide-down"
    >
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-[15px] font-semibold text-ink-1">
            {rule ? 'Edit event rule' : 'New event rule'}
          </h3>
          <p className="text-[12px] text-ink-3 italic-editorial mt-1">
            Fires after a task is already accepted (e.g. due date changes).
          </p>
        </div>
        <button type="button" onClick={onClose} className="text-ink-3 hover:text-ink-1 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FormField label="Name">
          <input
            type="text"
            value={form.name}
            onChange={(e) => set({ name: e.target.value })}
            className="w-full h-9 px-3 rounded border border-line-1 bg-surface-1 text-[13px] focus:border-accent focus:outline-none"
            placeholder="e.g. Earlier due dates → ops team"
          />
        </FormField>
        <FormField label="Portal">
          <select
            value={form.portal}
            onChange={(e) => set({ portal: e.target.value })}
            className="w-full h-9 px-2 rounded border border-line-1 bg-surface-1 text-[13px] focus:border-accent focus:outline-none"
          >
            <option value="*">Any portal</option>
            {portals.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
          </select>
        </FormField>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FormField label="Trigger">
          <select
            value={form.trigger}
            onChange={(e) => set({ trigger: e.target.value })}
            className="w-full h-9 px-2 rounded border border-line-1 bg-surface-1 text-[13px] focus:border-accent focus:outline-none"
          >
            <option value="due_date_changed">Due date changed</option>
          </select>
        </FormField>
        <FormField label="Min change (minutes)">
          <input
            type="number"
            min="0"
            value={form.min_delta_minutes}
            onChange={(e) => set({ min_delta_minutes: Number(e.target.value) || 0 })}
            className="w-full h-9 px-3 rounded border border-line-1 bg-surface-1 text-[13px] focus:border-accent focus:outline-none"
            placeholder="0 = fire on any change"
          />
        </FormField>
      </div>

      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2 text-[13px] text-ink-2 cursor-pointer">
          <Switch checked={form.only_earlier} onCheckedChange={(v) => set({ only_earlier: v })} />
          Only when due date moved <span className="font-medium text-warning">earlier</span>
        </label>
        <label className="flex items-center gap-2 text-[13px] text-ink-2 cursor-pointer">
          <Switch checked={form.is_active} onCheckedChange={(v) => set({ is_active: v })} />
          Active
        </label>
      </div>

      <FormField label="Channels">
        <div className="flex gap-2">
          {['in_app', 'email'].map((ch) => {
            const active = form.channels.includes(ch);
            return (
              <button
                key={ch}
                type="button"
                onClick={() => toggleChannel(ch)}
                className={`h-8 px-3 rounded text-[12px] font-medium transition-colors duration-tab border ${
                  active
                    ? 'bg-accent-soft text-accent-ink border-accent'
                    : 'bg-surface-1 text-ink-3 border-line-1 hover:bg-surface-2'
                }`}
              >
                {ch === 'in_app' ? 'In-app (bell)' : 'Email'}
              </button>
            );
          })}
        </div>
      </FormField>

      {form.channels.includes('email') && (
        <FormField
          label="Recipients"
          hint={`Add email addresses. Use the special token "admins" to expand to every admin user at fire time.`}
        >
          <div className="flex flex-wrap gap-1.5 mb-2">
            {form.recipients.map((r) => (
              <span
                key={r}
                className="inline-flex items-center gap-1 text-[12px] bg-accent-soft text-accent-ink px-2 py-0.5 rounded"
              >
                {r}
                <button type="button" onClick={() => removeRecipient(r)} className="hover:text-danger">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={recipInput}
              onChange={(e) => setRecipInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addRecipient(); } }}
              placeholder="alice@example.com or admins"
              className="flex-1 h-9 px-3 rounded border border-line-1 bg-surface-1 text-[13px] focus:border-accent focus:outline-none"
            />
            <button
              type="button"
              onClick={addRecipient}
              className="h-9 px-3 rounded border border-line-1 text-[12px] text-ink-2 hover:bg-surface-2 transition-colors duration-tab"
            >
              Add
            </button>
          </div>
        </FormField>
      )}

      <FormField
        label="Conditions"
        hint="AND-combined. Empty = fires for every task that passes the portal + delta gates."
      >
        <div className="space-y-2">
          {form.conditions.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <select
                value={c.field}
                onChange={(e) => updateCondition(i, { field: e.target.value })}
                className="h-8 px-2 rounded border border-line-1 bg-surface-1 text-[12px]"
              >
                {FIELDS.map((f) => <option key={f.v} value={f.v}>{f.l}</option>)}
              </select>
              <select
                value={c.operator}
                onChange={(e) => updateCondition(i, { operator: e.target.value })}
                className="h-8 px-2 rounded border border-line-1 bg-surface-1 text-[12px]"
              >
                {OPS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
              <input
                type="text"
                value={c.value}
                onChange={(e) => updateCondition(i, { value: e.target.value })}
                className="flex-1 h-8 px-2 rounded border border-line-1 bg-surface-1 text-[12px]"
                placeholder="value"
              />
              <button
                type="button"
                onClick={() => removeCondition(i)}
                className="h-8 w-8 inline-flex items-center justify-center rounded text-ink-3 hover:bg-danger-soft hover:text-danger"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addCondition}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded border border-dashed border-line-2 text-[12px] text-ink-3 hover:text-ink-1 hover:border-ink-3 transition-colors duration-tab"
          >
            <Plus className="w-3.5 h-3.5" /> Add condition
          </button>
        </div>
      </FormField>

      {form.channels.includes('email') && (
        <details className="border-t border-line-1 pt-4">
          <summary className="text-[12px] font-medium text-ink-2 cursor-pointer hover:text-ink-1">
            Email customization (optional)
          </summary>
          <div className="mt-3 space-y-3">
            <FormField
              label="Subject template"
              hint="Tokens: {task_name} {portal} {project_name} {client_name} {delta} {direction}"
            >
              <input
                type="text"
                value={form.email_subject_template}
                onChange={(e) => set({ email_subject_template: e.target.value })}
                className="w-full h-9 px-3 rounded border border-line-1 bg-surface-1 text-[13px] focus:border-accent focus:outline-none"
                placeholder="[{portal}] {task_name} moved {direction}"
              />
            </FormField>
            <FormField label="Body note" hint="Plain text — rendered as a highlighted callout above the date table.">
              <textarea
                value={form.email_body_note}
                onChange={(e) => set({ email_body_note: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 rounded border border-line-1 bg-surface-1 text-[13px] focus:border-accent focus:outline-none resize-none"
                placeholder="e.g. Reply-all to coordinate. PM is on call this week."
              />
            </FormField>
          </div>
        </details>
      )}

      <div className="flex justify-end gap-2 pt-2 border-t border-line-1">
        <button
          type="button"
          onClick={onClose}
          className="h-9 px-4 rounded text-[13px] text-ink-3 hover:bg-surface-2 transition-colors duration-tab"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={mutation.isPending}
          className="inline-flex items-center gap-2 h-9 px-4 rounded bg-accent text-white text-[13px] font-medium hover:bg-[var(--accent-hover)] disabled:opacity-60 transition-colors duration-tab"
        >
          <Save className="w-3.5 h-3.5" />
          {mutation.isPending ? 'Saving…' : rule ? 'Save changes' : 'Create rule'}
        </button>
      </div>
    </form>
  );
}