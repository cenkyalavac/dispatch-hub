import { useState } from 'react';
import { Plus } from 'lucide-react';
import ConditionValueInput from '@/components/rules/ConditionValueInput';

const FIELDS = [
  { key: 'source_language', label: 'Source language' },
  { key: 'target_language', label: 'Target language' },
  { key: 'client_name',     label: 'Client name' },
  { key: 'workflow_name',   label: 'Workflow name' },
  { key: 'service_tag',     label: 'Service tag' },
];

export default function MappingForm({ portals, onSubmit }) {
  const [form, setForm] = useState({
    portal: '*', field: 'source_language', source_value: '', destination_value: '', notes: '',
  });

  const submit = (e) => {
    e.preventDefault();
    if (!form.source_value.trim() || !form.destination_value.trim()) return;
    onSubmit({ ...form, source_value: form.source_value.trim(), destination_value: form.destination_value.trim() });
    setForm({ ...form, source_value: '', destination_value: '', notes: '' });
  };

  const input = 'field-control h-9 px-3 rounded-md border border-line-1 bg-surface-1 text-[13px] outline-none placeholder:text-ink-4';

  return (
    <form onSubmit={submit} className="bg-surface-2 border border-line-1 rounded-md p-4 mb-4">
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
        <select
          value={form.portal}
          onChange={(e) => setForm({ ...form, portal: e.target.value })}
          className={input}
        >
          <option value="*">Any portal</option>
          {portals.map(p => <option key={p.key} value={p.key}>{p.name}</option>)}
        </select>
        <select
          value={form.field}
          onChange={(e) => setForm({ ...form, field: e.target.value })}
          className={input}
        >
          {FIELDS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
        </select>
        {/* Source value is suggested from the actual portal data. */}
        <div className="self-center">
          <ConditionValueInput
            portal={form.portal}
            field={form.field}
            value={form.source_value}
            onChange={(v) => setForm({ ...form, source_value: v })}
          />
        </div>
        <input
          value={form.destination_value}
          onChange={(e) => setForm({ ...form, destination_value: e.target.value })}
          placeholder="To (e.g. EN)"
          className={input}
        />
        <input
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          placeholder="Notes (optional)"
          className={input}
        />
        <button
          type="submit"
          className="inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-md bg-accent text-white text-[13px] font-medium hover:bg-[var(--accent-hover)] transition-colors duration-tab"
        >
          <Plus className="w-3.5 h-3.5" /> Add
        </button>
      </div>
    </form>
  );
}