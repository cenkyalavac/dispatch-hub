import { useState } from 'react';
import { Plus } from 'lucide-react';

const TYPES = [
  { key: 'client',   label: 'Client' },
  { key: 'account',  label: 'Account' },
  { key: 'project',  label: 'Project' },
  { key: 'workflow', label: 'Workflow' },
];

// Which types support matching by ID (vs name). Mirrors FRIENDLY_FIELDS in
// lib/friendly.js — kept in sync manually because the form needs to disable
// the option for types where no ID field exists on the task payload.
const ID_CAPABLE = new Set(['account', 'project']);

export default function FriendlyNameForm({ portals, onSubmit }) {
  const [form, setForm] = useState({
    portal: '*', type: 'client', match_by: 'name',
    source_value: '', display_name: '', notes: '',
  });

  // When user switches to a type that doesn't support ID matching, snap back
  // to 'name' so we don't silently submit a stale match_by.
  const setType = (t) => {
    setForm((f) => ({
      ...f, type: t,
      match_by: ID_CAPABLE.has(t) ? f.match_by : 'name',
    }));
  };

  const submit = (e) => {
    e.preventDefault();
    if (!form.source_value.trim() || !form.display_name.trim()) return;
    onSubmit({
      ...form,
      source_value: form.source_value.trim(),
      display_name: form.display_name.trim(),
    });
    setForm({ ...form, source_value: '', display_name: '', notes: '' });
  };

  const input = 'field-control h-9 px-3 rounded-md border border-line-1 bg-surface-1 text-[13px] outline-none placeholder:text-ink-4';

  return (
    <form onSubmit={submit} className="bg-surface-2 border border-line-1 rounded-md p-4 mb-4">
      <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
        <select value={form.portal} onChange={(e) => setForm({ ...form, portal: e.target.value })} className={input}>
          <option value="*">Any portal</option>
          {portals.map(p => <option key={p.key} value={p.key}>{p.name}</option>)}
        </select>
        <select value={form.type} onChange={(e) => setType(e.target.value)} className={input}>
          {TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
        <select
          value={form.match_by}
          onChange={(e) => setForm({ ...form, match_by: e.target.value })}
          className={input}
          disabled={!ID_CAPABLE.has(form.type)}
          title={ID_CAPABLE.has(form.type) ? 'Match against name or upstream ID' : 'This type only supports name matching'}
        >
          <option value="name">By name</option>
          {ID_CAPABLE.has(form.type) && <option value="id">By ID</option>}
        </select>
        <input
          value={form.source_value}
          onChange={(e) => setForm({ ...form, source_value: e.target.value })}
          placeholder={form.match_by === 'id' ? 'Upstream ID' : 'Original value'}
          className={input}
        />
        <input
          value={form.display_name}
          onChange={(e) => setForm({ ...form, display_name: e.target.value })}
          placeholder="Friendly name"
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