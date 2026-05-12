import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Save, FolderTree } from 'lucide-react';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';

const KEY_BASE = 'dropbox_base_path';
const KEY_TEMPLATE = 'dropbox_folder_template';

// Live preview using literal sample values.
const SAMPLE = { account: 'Acme Corp', project: 'Q1 Localization', task_id: '12345', task_name: 'EN to DE Review' };
const renderTemplate = (tpl, sample = SAMPLE) =>
  tpl.replace(/\{(\w+)\}/g, (_, k) => sample[k] ?? `{${k}}`);

export default function HandoffPathSection() {
  const qc = useQueryClient();
  const [basePath, setBasePath] = useState('');
  const [template, setTemplate] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: settings = [], isLoading } = useQuery({
    queryKey: ['app-settings'],
    queryFn: () => base44.entities.AppSetting.list(),
  });

  // Hydrate local state when settings arrive (only once per fetch, not on every keystroke).
  useEffect(() => {
    if (settings.length === 0) return;
    const find = (k) => settings.find(s => s.key === k);
    setBasePath(find(KEY_BASE)?.value ?? 'Symfonie');
    setTemplate(find(KEY_TEMPLATE)?.value ?? '{account}/{project}/{task_id}_{task_name}/HO');
  }, [settings]);

  const upsert = async (key, value, description) => {
    const existing = settings.find(s => s.key === key);
    if (existing) {
      await base44.entities.AppSetting.update(existing.id, { value });
    } else {
      await base44.entities.AppSetting.create({ key, value, description });
    }
  };

  const save = async () => {
    if (!basePath.trim() || !template.trim()) {
      toast.error('Base path and template are required');
      return;
    }
    if (!template.includes('{task_id}')) {
      toast.error('Template must include {task_id} for uniqueness');
      return;
    }
    setSaving(true);
    try {
      await Promise.all([
        upsert(KEY_BASE, basePath.trim(), 'Dropbox root folder for handoffs'),
        upsert(KEY_TEMPLATE, template.trim(), 'Folder pattern under base path. Tokens: {account} {project} {task_id} {task_name}'),
      ]);
      qc.invalidateQueries({ queryKey: ['app-settings'] });
      toast.success('Handoff path saved');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const fullPreview = `/${basePath.replace(/^\/+|\/+$/g, '')}/${renderTemplate(template).replace(/^\/+/, '')}`;
  const input = 'w-full h-9 px-3 rounded-md border border-line-1 bg-surface-1 text-[13px] font-mono outline-none placeholder:text-ink-4';

  return (
    <section className="bg-surface-1 border border-line-1 rounded-md p-5">
      <div className="flex items-center gap-2">
        <FolderTree className="w-4 h-4 text-ink-3" />
        <h2 className="text-[14px] font-semibold text-ink-1">Dropbox handoff path</h2>
      </div>
      <p className="text-[12px] text-ink-3 italic-editorial mt-1">
        Where accepted task attachments land — applies to every portal that hands off files (Symfonie, Junction, …). Tokens: <code className="font-mono not-italic">{'{account}'}</code>, <code className="font-mono not-italic">{'{project}'}</code>, <code className="font-mono not-italic">{'{task_id}'}</code>, <code className="font-mono not-italic">{'{task_name}'}</code>.
      </p>

      {isLoading ? (
        <div className="mt-4 space-y-2"><Skeleton className="h-9" /><Skeleton className="h-9" /></div>
      ) : (
        <div className="mt-4 space-y-3">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-ink-3">Base path (under root)</label>
            <input
              value={basePath}
              onChange={(e) => setBasePath(e.target.value)}
              placeholder="Symfonie"
              className={`${input} mt-1`}
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-ink-3">Folder template</label>
            <input
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              placeholder="{account}/{project}/{task_id}_{task_name}/HO"
              className={`${input} mt-1`}
            />
          </div>

          <div className="bg-surface-2 border border-line-1 rounded-md px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-ink-3 mb-1">Preview</p>
            <p className="text-[12px] font-mono text-ink-1 break-all">{fullPreview}</p>
          </div>

          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-2 h-9 px-4 rounded-md bg-accent text-white text-[13px] font-medium hover:bg-[var(--accent-hover)] transition-colors duration-tab disabled:opacity-40"
          >
            <Save className="w-3.5 h-3.5" /> {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
    </section>
  );
}