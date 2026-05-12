import { FolderTree } from 'lucide-react';
import FormField from '@/components/ui/FormField';

const fieldCls = 'w-full h-9 px-3 rounded-md border border-line-1 bg-surface-1 text-[13px] font-mono outline-none placeholder:text-ink-4';

const SAMPLE = { account: 'Acme Corp', project: 'Q1 Localization', task_id: '12345', task_name: 'EN to DE Review' };
const renderTemplate = (tpl) => tpl.replace(/\{(\w+)\}/g, (_, k) => SAMPLE[k] ?? `{${k}}`);

// Per-portal Dropbox handoff config. Empty fields = inherit the global AppSetting defaults.
export default function PortalDropboxFields({ basePath, template, onChange }) {
  const preview = (basePath || template)
    ? `/${(basePath || 'Symfonie').replace(/^\/+|\/+$/g, '')}/${renderTemplate(template || '{account}/{project}/{task_id}_{task_name}/HO').replace(/^\/+/, '')}`
    : null;

  return (
    <section className="border-t border-line-1 pt-4 mt-1">
      <div className="flex items-center gap-2 mb-1">
        <FolderTree className="w-3.5 h-3.5 text-ink-3" />
        <h3 className="text-[13px] font-semibold text-ink-1">Dropbox handoff</h3>
        <span className="text-[11px] text-ink-3 italic-editorial">— leave blank to use the global default</span>
      </div>

      <div className="grid grid-cols-2 gap-3 mt-3">
        <FormField label="Base path">
          <input
            className={fieldCls}
            value={basePath || ''}
            onChange={(e) => onChange('dropbox_base_path', e.target.value)}
            placeholder="Symfonie"
          />
        </FormField>
        <FormField label="Folder template" helper="Tokens: {account} {project} {task_id} {task_name}">
          <input
            className={fieldCls}
            value={template || ''}
            onChange={(e) => onChange('dropbox_folder_template', e.target.value)}
            placeholder="{account}/{project}/{task_id}_{task_name}/HO"
          />
        </FormField>
      </div>

      {preview && (
        <div className="bg-surface-2 border border-line-1 rounded-md px-3 py-2 mt-2">
          <p className="text-[10px] uppercase tracking-wider text-ink-3 mb-1">Preview</p>
          <p className="text-[11px] font-mono text-ink-1 break-all">{preview}</p>
        </div>
      )}
    </section>
  );
}