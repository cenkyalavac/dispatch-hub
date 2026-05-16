import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { Save, X } from 'lucide-react';
import { toast } from 'sonner';
import { slugify, uniqueSlug } from '@/lib/slug';

const input = 'w-full h-9 px-3 rounded-md border border-line-1 bg-surface-1 text-[13px] outline-none placeholder:text-ink-4';

// Create or edit a Client. `client` is the row when editing; null/undefined for new.
// `existingSlugs` is the list of slugs already in use so we can warn / auto-suffix.
export default function ClientForm({ client, existingSlugs = [], onClose }) {
  const qc = useQueryClient();
  const [displayName, setDisplayName] = useState(client?.display_name || '');
  const [slug, setSlug] = useState(client?.slug || '');
  const [slugTouched, setSlugTouched] = useState(!!client?.slug);
  const [notes, setNotes] = useState(client?.notes || '');
  const [isActive, setIsActive] = useState(client?.is_active ?? true);
  const [saving, setSaving] = useState(false);

  // Auto-derive slug from display name until the user manually edits it.
  useEffect(() => {
    if (!slugTouched) setSlug(slugify(displayName));
  }, [displayName, slugTouched]);

  const save = async () => {
    if (!displayName.trim()) {
      toast.error('Display name is required');
      return;
    }
    const otherSlugs = existingSlugs.filter(s => s !== client?.slug);
    const baseSlug = slugify(slug || displayName);
    if (!baseSlug) {
      toast.error('Slug cannot be empty');
      return;
    }
    const finalSlug = uniqueSlug(baseSlug, otherSlugs);
    const payload = {
      display_name: displayName.trim(),
      slug: finalSlug,
      notes: notes.trim(),
      is_active: isActive,
    };

    setSaving(true);
    try {
      if (client?.id) {
        await base44.entities.Client.update(client.id, payload);
        toast.success('Client updated');
      } else {
        await base44.entities.Client.create(payload);
        toast.success('Client created');
      }
      qc.invalidateQueries({ queryKey: ['clients'] });
      onClose?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-surface-1 border border-line-1 rounded-md p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[14px] font-semibold text-ink-1">
          {client?.id ? 'Edit client' : 'New client'}
        </h3>
        <button
          onClick={onClose}
          className="inline-flex items-center justify-center h-7 w-7 rounded text-ink-3 hover:bg-surface-2 transition-colors duration-tab"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-ink-3">Display name</label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Apple Inc."
            className={`${input} mt-1`}
            autoFocus
          />
        </div>

        <div>
          <label className="text-[10px] uppercase tracking-wider text-ink-3">Slug</label>
          <input
            value={slug}
            onChange={(e) => { setSlug(slugify(e.target.value)); setSlugTouched(true); }}
            placeholder="apple-inc"
            className={`${input} mt-1 font-mono`}
          />
          <p className="text-[11px] text-ink-3 italic-editorial mt-1">
            URL-safe identifier. Auto-generated from the name unless you edit it.
          </p>
        </div>

        <div>
          <label className="text-[10px] uppercase tracking-wider text-ink-3">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className={`${input} mt-1 h-auto py-2 resize-y`}
          />
        </div>

        <label className="inline-flex items-center gap-2 text-[12px] text-ink-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="h-3.5 w-3.5"
          />
          Active
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="h-9 px-3 rounded-md border border-line-1 bg-surface-1 hover:bg-surface-2 text-[13px] text-ink-2 transition-colors duration-tab"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-2 h-9 px-4 rounded-md bg-accent text-white text-[13px] font-medium hover:bg-[var(--accent-hover)] transition-colors duration-tab disabled:opacity-40"
          >
            <Save className="w-3.5 h-3.5" /> {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}