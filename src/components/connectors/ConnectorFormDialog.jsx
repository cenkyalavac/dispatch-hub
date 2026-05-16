import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import FormField from '@/components/ui/FormField';
import PortalDropboxFields from './PortalDropboxFields';
import PortalSheetsFields from './PortalSheetsFields';
import PortalSheetRoutes from './PortalSheetRoutes';

// `vendor` is kept on the schema for backwards compatibility with legacy rows
// but no longer surfaced in the UI — Client is the canonical attribution now.
const empty = {
  key: '', name: '', client_id: '', description: '',
  icon: 'Globe', color: 'blue', is_active: true,
  auth_type: 'oauth2_client_credentials', docs_url: '',
  dropbox_base_path: '', dropbox_folder_template: '',
  sheets_spreadsheet_id: '', sheets_tab_name: '',
};

const ICONS = ['Globe', 'Building2', 'Network', 'Plug', 'Boxes', 'Briefcase', 'Cloud'];
const AUTH_TYPES = [
  { value: 'oauth2_client_credentials', label: 'OAuth 2.0 — Client Credentials' },
  { value: 'jwt_bearer', label: 'JWT Bearer Token' },
  { value: 'api_key', label: 'API Key' },
  { value: 'none', label: 'No authentication' },
];

const fieldCls = 'w-full h-9 px-3 rounded-md border border-line-1 bg-surface-1 text-[13px] outline-none placeholder:text-ink-4';

export default function ConnectorFormDialog({ open, onClose, onSave, initial, isPending }) {
  const [form, setForm] = useState(empty);
  const isEdit = !!initial?.id;

  // Active clients populate the attribution dropdown. Inactive ones are hidden
  // so you can't accidentally tag a new connector to an archived customer, but
  // if the connector is already mapped to an inactive client we still surface it.
  const { data: clients = [] } = useQuery({
    queryKey: ['clients'],
    queryFn: () => base44.entities.Client.list('-created_date'),
    enabled: open,
  });

  useEffect(() => { if (open) setForm(initial ? { ...empty, ...initial } : empty); }, [open, initial]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  const update = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4"
      style={{ background: 'oklch(0.18 0.02 260 / 0.35)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        // Modal 640px width — doctrine medium, fits the new Dropbox/Sheets sections cleanly.
        className="w-full max-w-[640px] max-h-[85vh] overflow-y-auto bg-surface-1 border border-line-1 rounded-lg shadow-xl animate-slide-down"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-5 h-12 border-b border-line-1">
          <h2 className="text-[14px] font-semibold text-ink-1">{isEdit ? 'Edit connector' : 'New connector'}</h2>
          <button onClick={onClose} className="inline-flex items-center justify-center h-7 w-7 rounded text-ink-3 hover:bg-surface-2 transition-colors duration-tab">
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="px-5 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Key" required helper={isEdit ? 'Immutable once created' : 'lowercase, no spaces'}>
              <input
                className={fieldCls}
                value={form.key}
                disabled={isEdit}
                onChange={e => update('key', e.target.value.toLowerCase().replace(/\s/g, '_'))}
                placeholder="junction"
              />
            </FormField>
            <FormField label="Display name" required>
              <input className={fieldCls} value={form.name} onChange={e => update('name', e.target.value)} placeholder="Welocalize Junction" />
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Client" helper="Which end-customer this connector belongs to.">
              <select
                className={fieldCls}
                value={form.client_id || ''}
                onChange={e => update('client_id', e.target.value || null)}
              >
                <option value="">— Unassigned —</option>
                {clients
                  .filter(c => c.is_active || c.id === form.client_id)
                  .map(c => (
                    <option key={c.id} value={c.id}>
                      {c.display_name}{!c.is_active ? ' (inactive)' : ''}
                    </option>
                  ))}
              </select>
            </FormField>
            <FormField label="Docs URL">
              <input className={fieldCls} value={form.docs_url || ''} onChange={e => update('docs_url', e.target.value)} placeholder="https://…" />
            </FormField>
          </div>
          {clients.length === 0 && (
            <p className="text-[11px] text-ink-3 italic-editorial -mt-2">
              No clients yet — create one on the Clients page first to assign this connector.
            </p>
          )}

          <FormField label="Description" helper="One short line, shown on the card.">
            <input className={fieldCls} value={form.description || ''} onChange={e => update('description', e.target.value)} placeholder="What this connector does" />
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Icon">
              <select className={fieldCls} value={form.icon} onChange={e => update('icon', e.target.value)}>
                {ICONS.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </FormField>
            <FormField label="Auth type">
              <select className={fieldCls} value={form.auth_type} onChange={e => update('auth_type', e.target.value)}>
                {AUTH_TYPES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </FormField>
          </div>

          <PortalDropboxFields
            basePath={form.dropbox_base_path}
            template={form.dropbox_folder_template}
            onChange={update}
          />

          <PortalSheetsFields
            portalKey={isEdit ? form.key : null}
            spreadsheetId={form.sheets_spreadsheet_id}
            tabName={form.sheets_tab_name}
            onChange={update}
          />

          <PortalSheetRoutes portalKey={isEdit ? form.key : null} />
        </div>

        <footer className="px-5 py-4 border-t border-line-1 flex items-center justify-end gap-2">
          <button onClick={onClose} className="h-9 px-4 rounded-md border border-line-1 text-[13px] text-ink-2 hover:bg-surface-2 transition-colors duration-tab">
            Cancel
          </button>
          <button
            onClick={() => onSave(form)}
            disabled={isPending || !form.key || !form.name}
            className="h-9 px-4 rounded-md bg-accent text-white text-[13px] font-medium hover:bg-[var(--accent-hover)] transition-colors duration-tab disabled:opacity-40"
          >
            {isPending ? 'Saving…' : 'Save'}
          </button>
        </footer>
      </div>
    </div>
  );
}