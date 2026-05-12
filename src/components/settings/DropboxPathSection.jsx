import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Save, FolderTree } from 'lucide-react';

const DEFAULT_TEMPLATE = '{account}/{project}/{task_id}_{task_name}/HO';
const KEYS = {
  base: 'dropbox_base_path',
  template: 'dropbox_folder_template',
};

const TOKENS = ['{account}', '{project}', '{task_id}', '{task_name}'];

// Tek bir AppSetting kaydını upsert et — varsa update, yoksa create.
async function upsertSetting(key, value, description) {
  const existing = await base44.entities.AppSetting.filter({ key }, '', 1);
  if (existing[0]) {
    await base44.entities.AppSetting.update(existing[0].id, { value, description });
  } else {
    await base44.entities.AppSetting.create({ key, value, description });
  }
}

export default function DropboxPathSection() {
  const [basePath, setBasePath] = useState('');
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const all = await base44.entities.AppSetting.list();
        const b = all.find(s => s.key === KEYS.base);
        const t = all.find(s => s.key === KEYS.template);
        if (b?.value) setBasePath(b.value);
        if (t?.value) setTemplate(t.value);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const cleanBase = basePath.trim().replace(/^\/+|\/+$/g, '');
      const cleanTpl = (template || DEFAULT_TEMPLATE).trim();
      await Promise.all([
        upsertSetting(KEYS.base, cleanBase, 'Dropbox root folder for handoffs (e.g. Symfonie or Moravia/Inbox)'),
        upsertSetting(KEYS.template, cleanTpl, 'Folder pattern under base path. Tokens: {account} {project} {task_id} {task_name}'),
      ]);
      toast.success('Dropbox path settings saved');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Live preview — token'ları örnek değerlerle değiştir
  const preview = '/' + [
    basePath.trim().replace(/^\/+|\/+$/g, ''),
    template
      .replace(/\{account\}/g, 'Meta')
      .replace(/\{project\}/g, 'WhatsApp_Subtitles')
      .replace(/\{task_id\}/g, '41889722')
      .replace(/\{task_name\}/g, 'Translation'),
  ].filter(Boolean).join('/').replace(/\/+/g, '/').replace(/\/$/, '');

  return (
    <section className="bg-surface-1 border border-line-1 rounded-md p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h2 className="text-[14px] font-semibold text-ink-1">Dropbox handoff path</h2>
          <p className="text-[12px] text-ink-3 italic-editorial mt-0.5">
            Where accepted task attachments land in Dropbox.
          </p>
        </div>
        <FolderTree className="w-4 h-4 text-ink-3" />
      </div>

      {loading ? (
        <div className="space-y-3">
          <div className="skel h-9" />
          <div className="skel h-9" />
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-ink-3 mb-1.5">
              Base path
            </label>
            <input
              value={basePath}
              onChange={(e) => setBasePath(e.target.value)}
              placeholder="e.g. Symfonie or Moravia/Inbox (empty = root)"
              className="w-full h-9 px-3 rounded-md border border-line-1 bg-surface-1 text-[13px] outline-none placeholder:text-ink-4 font-mono"
            />
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-wider text-ink-3 mb-1.5">
              Folder template
            </label>
            <input
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              placeholder={DEFAULT_TEMPLATE}
              className="w-full h-9 px-3 rounded-md border border-line-1 bg-surface-1 text-[13px] outline-none placeholder:text-ink-4 font-mono"
            />
            <div className="mt-2 flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] uppercase tracking-wider text-ink-3">Tokens:</span>
              {TOKENS.map(tok => (
                <button
                  key={tok}
                  type="button"
                  onClick={() => setTemplate(t => t + tok)}
                  className="font-mono text-[10px] text-accent-ink bg-accent-soft hover:bg-accent hover:text-white transition-colors duration-tab px-1.5 py-0.5 rounded"
                >
                  {tok}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-wider text-ink-3 mb-1">Preview</p>
            <p className="text-[12px] font-mono text-ink-1 bg-surface-2 border border-line-1 rounded p-2 break-all">
              {preview}
            </p>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 h-9 px-4 rounded-md bg-accent text-white text-[13px] font-medium hover:bg-[var(--accent-hover)] transition-colors duration-tab disabled:opacity-40"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Saving…' : 'Save path settings'}
          </button>
        </div>
      )}
    </section>
  );
}