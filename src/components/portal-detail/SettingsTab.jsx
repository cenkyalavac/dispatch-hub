import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, Languages, AlertTriangle, Plus, X, Trash2, Plug, Code } from 'lucide-react';
import { toast } from 'sonner';
import FormField from '@/components/ui/FormField';
import PortalDropboxFields from '@/components/connectors/PortalDropboxFields';
import PortalSheetsFields from '@/components/connectors/PortalSheetsFields';
import { DEFAULT_FIELDS } from '@/lib/portal-fields';

// All editable per-portal config in one place: identity, function bindings,
// Dropbox handoff, Sheets log, language families (GlobalLink), rule_fields, danger zone.

const fieldCls = 'w-full h-9 px-3 rounded-md border border-line-1 bg-surface-1 text-[13px] outline-none placeholder:text-ink-4';
const fieldMono = `${fieldCls} font-mono`;

export default function SettingsTab({ portal, onDeleted }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(() => normalize(portal));
  const [familyInput, setFamilyInput] = useState('');

  // If the underlying portal changes externally (e.g. test-connection updates),
  // re-sync the form. We only re-sync identity-level fields; in-flight user
  // edits are preserved by comparing key/id only.
  useEffect(() => {
    setForm((prev) => ({ ...normalize(portal), ...(prev.id === portal.id ? userEditableSubset(prev) : {}) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portal.id, portal.key]);

  const dirty = JSON.stringify(form) !== JSON.stringify(normalize(portal));

  const saveMutation = useMutation({
    mutationFn: (data) => base44.entities.Portal.update(portal.id, data),
    onSuccess: () => {
      toast.success('Settings saved');
      qc.invalidateQueries({ queryKey: ['portal-detail', portal.key] });
      qc.invalidateQueries({ queryKey: ['portals-all'] });
    },
    onError: (e) => toast.error('Save failed: ' + e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: () => base44.entities.Portal.delete(portal.id),
    onSuccess: () => {
      toast.success('Connector removed');
      qc.invalidateQueries({ queryKey: ['portals-all'] });
      onDeleted?.();
    },
  });

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const addFamily = () => {
    const v = familyInput.trim().toLowerCase();
    if (!v) return;
    if (form.allowed_language_families.includes(v)) { setFamilyInput(''); return; }
    set('allowed_language_families', [...form.allowed_language_families, v]);
    setFamilyInput('');
  };
  const removeFamily = (f) => set('allowed_language_families', form.allowed_language_families.filter((x) => x !== f));

  const resetFieldsToDefault = () => {
    const defaults = DEFAULT_FIELDS[portal.key] || [];
    set('rule_fields', defaults);
  };
  const clearFields = () => set('rule_fields', []);

  const save = () => {
    const { id: _omit, ...payload } = form;
    saveMutation.mutate(payload);
  };

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Identity */}
      <section className="bg-surface-1 border border-line-1 rounded-md p-5">
        <h3 className="text-[13px] font-semibold text-ink-1 mb-3 inline-flex items-center gap-1.5">
          <Plug className="w-3.5 h-3.5 text-ink-3" /> Identity
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Name" required>
            <input className={fieldCls} value={form.name} onChange={(e) => set('name', e.target.value)} />
          </FormField>
          <FormField label="Vendor">
            <input className={fieldCls} value={form.vendor || ''} onChange={(e) => set('vendor', e.target.value)} />
          </FormField>
          <div className="col-span-2">
            <FormField label="Description">
              <input className={fieldCls} value={form.description || ''} onChange={(e) => set('description', e.target.value)} />
            </FormField>
          </div>
          <FormField label="Docs URL">
            <input className={fieldCls} value={form.docs_url || ''} onChange={(e) => set('docs_url', e.target.value)} placeholder="https://…" />
          </FormField>
          <FormField label="Auth type">
            <select className={fieldCls} value={form.auth_type || 'none'} onChange={(e) => set('auth_type', e.target.value)}>
              <option value="none">None</option>
              <option value="oauth2_client_credentials">OAuth 2.0 Client Credentials</option>
              <option value="jwt_bearer">JWT Bearer</option>
              <option value="api_key">API Key</option>
            </select>
          </FormField>
        </div>
      </section>

      {/* Function bindings */}
      <section className="bg-surface-1 border border-line-1 rounded-md p-5">
        <h3 className="text-[13px] font-semibold text-ink-1 mb-3 inline-flex items-center gap-1.5">
          <Code className="w-3.5 h-3.5 text-ink-3" /> Backend function bindings
        </h3>
        <p className="text-[11px] text-ink-3 italic-editorial mb-3">
          Names of backend functions that handle this connector's lifecycle. Leave blank to disable a capability.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Test function">
            <input className={fieldMono} value={form.test_function || ''} onChange={(e) => set('test_function', e.target.value.trim())} />
          </FormField>
          <FormField label="Fetch function">
            <input className={fieldMono} value={form.fetch_function || ''} onChange={(e) => set('fetch_function', e.target.value.trim())} />
          </FormField>
          <FormField label="Process function" helper="Rule-based automation">
            <input className={fieldMono} value={form.process_function || ''} onChange={(e) => set('process_function', e.target.value.trim())} />
          </FormField>
          <FormField label="Accept function">
            <input className={fieldMono} value={form.accept_function || ''} onChange={(e) => set('accept_function', e.target.value.trim())} />
          </FormField>
          <FormField label="Reject function">
            <input className={fieldMono} value={form.reject_function || ''} onChange={(e) => set('reject_function', e.target.value.trim())} />
          </FormField>
          <FormField label="History function">
            <input className={fieldMono} value={form.history_function || ''} onChange={(e) => set('history_function', e.target.value.trim())} />
          </FormField>
        </div>
      </section>

      {/* Language families — GlobalLink-relevant (shown for all, harmless empty) */}
      <section className="bg-surface-1 border border-line-1 rounded-md p-5">
        <h3 className="text-[13px] font-semibold text-ink-1 mb-1 inline-flex items-center gap-1.5">
          <Languages className="w-3.5 h-3.5 text-ink-3" /> Allowed language families
        </h3>
        <p className="text-[11px] text-ink-3 italic-editorial mb-3">
          ISO 639-1 prefixes (e.g. <code className="font-mono">tr</code>, <code className="font-mono">ar</code>). Used by GlobalLink to
          decide which target locales to claim. <code className="font-mono">tr</code> covers <code className="font-mono">tr-TR</code>,
          <code className="font-mono">tr-x-foo</code>, etc. Empty list = claim every available locale.
        </p>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {form.allowed_language_families.length === 0 ? (
            <span className="text-[12px] text-ink-3 italic-editorial">No filter — all locales allowed.</span>
          ) : form.allowed_language_families.map((f) => (
            <span key={f} className="inline-flex items-center gap-1 text-[12px] bg-accent-soft text-accent-ink px-2 py-0.5 rounded">
              <code className="font-mono">{f}</code>
              <button onClick={() => removeFamily(f)} className="hover:text-danger"><X className="w-3 h-3" /></button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            className={`${fieldCls} font-mono w-32`}
            value={familyInput}
            onChange={(e) => setFamilyInput(e.target.value.toLowerCase())}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addFamily(); } }}
            placeholder="tr"
            maxLength={8}
          />
          <button
            type="button"
            onClick={addFamily}
            className="inline-flex items-center gap-1 h-9 px-3 rounded-md border border-line-1 text-[12px] text-ink-2 hover:bg-surface-2 transition-colors duration-tab"
          >
            <Plus className="w-3 h-3" /> Add family
          </button>
        </div>
      </section>

      {/* Rule fields */}
      <section className="bg-surface-1 border border-line-1 rounded-md p-5">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-[13px] font-semibold text-ink-1">Rule & mapping fields</h3>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={resetFieldsToDefault}
              className="h-7 px-2 rounded text-[11px] text-ink-2 hover:bg-surface-2 transition-colors duration-tab"
            >
              Reset to defaults
            </button>
            <button
              type="button"
              onClick={clearFields}
              className="h-7 px-2 rounded text-[11px] text-ink-2 hover:bg-surface-2 transition-colors duration-tab"
            >
              Clear
            </button>
          </div>
        </div>
        <p className="text-[11px] text-ink-3 italic-editorial mb-3">
          Fields available to rules, mappings, and routing for this portal. Empty list = use built-in defaults.
        </p>
        {(form.rule_fields || []).length === 0 ? (
          <p className="text-[12px] text-ink-3 italic-editorial">
            Using built-in defaults for <code className="font-mono">{portal.key}</code>.
          </p>
        ) : (
          <div className="space-y-1.5">
            {form.rule_fields.map((f, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_1fr_120px_36px] gap-2 items-center">
                <input
                  className={fieldMono}
                  value={f.name}
                  onChange={(e) => set('rule_fields', form.rule_fields.map((x, i) => i === idx ? { ...x, name: e.target.value.trim() } : x))}
                  placeholder="entity_field_name"
                />
                <input
                  className={fieldCls}
                  value={f.label}
                  onChange={(e) => set('rule_fields', form.rule_fields.map((x, i) => i === idx ? { ...x, label: e.target.value } : x))}
                  placeholder="UI Label"
                />
                <select
                  className={fieldCls}
                  value={f.type || 'string'}
                  onChange={(e) => set('rule_fields', form.rule_fields.map((x, i) => i === idx ? { ...x, type: e.target.value } : x))}
                >
                  <option value="string">Text</option>
                  <option value="number">Number</option>
                </select>
                <button
                  type="button"
                  onClick={() => set('rule_fields', form.rule_fields.filter((_, i) => i !== idx))}
                  className="inline-flex items-center justify-center h-9 w-9 rounded text-ink-3 hover:bg-danger-soft hover:text-danger transition-colors duration-tab"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={() => set('rule_fields', [...(form.rule_fields || []), { name: '', label: '', type: 'string' }])}
          className="mt-2 inline-flex items-center gap-1 h-8 px-2.5 rounded-md border border-dashed border-line-2 text-[12px] text-ink-2 hover:bg-surface-2 transition-colors duration-tab"
        >
          <Plus className="w-3 h-3" /> Add field
        </button>
      </section>

      {/* Dropbox */}
      <section className="bg-surface-1 border border-line-1 rounded-md p-5">
        <PortalDropboxFields
          basePath={form.dropbox_base_path}
          template={form.dropbox_folder_template}
          onChange={(k, v) => set(k, v)}
        />
      </section>

      {/* Sheets */}
      <section className="bg-surface-1 border border-line-1 rounded-md p-5">
        <PortalSheetsFields
          portalKey={portal.key}
          spreadsheetId={form.sheets_spreadsheet_id}
          tabName={form.sheets_tab_name}
          onChange={(k, v) => set(k, v)}
        />
      </section>

      {/* Save bar */}
      <div className="sticky bottom-0 bg-surface-1 border border-line-1 rounded-md p-3 flex items-center justify-between shadow-sm">
        <span className="text-[12px] text-ink-3">
          {dirty ? <span className="italic-editorial">Unsaved changes.</span> : 'All changes saved.'}
        </span>
        <button
          type="button"
          onClick={save}
          disabled={!dirty || saveMutation.isPending}
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-accent text-white text-[13px] font-medium hover:bg-[var(--accent-hover)] transition-colors duration-tab disabled:opacity-40"
        >
          <Save className="w-3.5 h-3.5" /> {saveMutation.isPending ? 'Saving…' : 'Save changes'}
        </button>
      </div>

      {/* Danger zone */}
      <section className="border border-danger/30 bg-danger-soft/30 rounded-md p-5">
        <h3 className="text-[13px] font-semibold text-danger mb-1 inline-flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5" /> Danger zone
        </h3>
        <p className="text-[12px] text-ink-2 mb-3">
          Removes the connector record. Past tasks, rules, and mappings stay intact but become orphaned.
        </p>
        <button
          type="button"
          onClick={() => { if (confirm(`Remove "${portal.name}"? This won't delete past tasks.`)) deleteMutation.mutate(); }}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-danger/40 text-[12px] text-danger hover:bg-danger hover:text-white transition-colors duration-tab"
        >
          <Trash2 className="w-3.5 h-3.5" /> Remove connector
        </button>
      </section>
    </div>
  );
}

// Normalize a Portal record into the editable shape used by this form.
function normalize(portal) {
  return {
    id: portal.id,
    key: portal.key,
    name: portal.name || '',
    vendor: portal.vendor || '',
    description: portal.description || '',
    docs_url: portal.docs_url || '',
    auth_type: portal.auth_type || 'none',
    icon: portal.icon || 'Globe',
    color: portal.color || 'blue',
    is_active: portal.is_active ?? true,
    required_secrets: portal.required_secrets || [],
    test_function: portal.test_function || '',
    fetch_function: portal.fetch_function || '',
    process_function: portal.process_function || '',
    accept_function: portal.accept_function || '',
    reject_function: portal.reject_function || '',
    history_function: portal.history_function || '',
    dropbox_base_path: portal.dropbox_base_path || '',
    dropbox_folder_template: portal.dropbox_folder_template || '',
    sheets_spreadsheet_id: portal.sheets_spreadsheet_id || '',
    sheets_tab_name: portal.sheets_tab_name || '',
    allowed_language_families: portal.allowed_language_families || [],
    rule_fields: portal.rule_fields || [],
  };
}

function userEditableSubset(form) {
  const { id: _omit1, key: _omit2, ...rest } = form;
  return rest;
}