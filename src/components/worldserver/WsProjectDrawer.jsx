import { useState, useEffect } from 'react';
import { Download, FileDown, Save } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import StatusPill from './StatusPill';
import WsTimeline from './WsTimeline';
import { vendorLabel } from '@/lib/worldserver';
import { fmtNumber, EM } from '@/lib/format';

function MetaItem({ label, value, mono }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-ink-3 font-medium">{label}</div>
      <div className={`text-[13px] text-ink-1 mt-0.5 break-words ${mono ? 'font-mono' : ''}`}>{value || EM}</div>
    </div>
  );
}

function ScopingBreakdown({ scopingRaw }) {
  if (!scopingRaw || typeof scopingRaw !== 'object') return null;
  const entries = Object.entries(scopingRaw).filter(([, v]) => typeof v === 'number' || typeof v === 'string');
  if (entries.length === 0) return null;
  return (
    <div className="border border-line-1 rounded-md overflow-hidden">
      <table className="w-full text-[12px]">
        <tbody>
          {entries.map(([k, v]) => (
            <tr key={k} className="border-b border-line-1 last:border-0">
              <td className="px-3 py-1.5 text-ink-2">{k}</td>
              <td className="px-3 py-1.5 text-right font-mono text-ink-1 tabular-nums">
                {typeof v === 'number' ? fmtNumber(v) : v}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function WsProjectDrawer({ project, open, onClose, onSaved }) {
  const [assignedPm, setAssignedPm] = useState('');
  const [internalNote, setInternalNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (project) {
      setAssignedPm(project.assignedPm || '');
      setInternalNote(project.internalNote || '');
    }
  }, [project]);

  if (!project) return null;

  const dirty = assignedPm !== (project.assignedPm || '') || internalNote !== (project.internalNote || '');

  const save = async () => {
    setSaving(true);
    try {
      await base44.entities.WsProject.update(project.id, { assignedPm, internalNote });
      toast.success('Triage saved');
      onSaved?.();
    } catch (e) {
      toast.error('Could not save', { description: e.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto p-0">
        <div className="px-6 py-5 border-b border-line-1">
          <div className="flex items-center gap-2 mb-2">
            <StatusPill status={project.status} />
            <span className="text-[12px] text-ink-3">{vendorLabel(project.vendor)}</span>
          </div>
          <h2 className="text-[18px] font-semibold tracking-tight text-ink-1 pr-8">{project.pgName || EM}</h2>
        </div>

        <div className="px-6 py-5 space-y-6">
          <div className="grid grid-cols-2 gap-x-4 gap-y-4">
            <MetaItem label="Project group ID" value={project.pgId} mono />
            <MetaItem label="Translation request" value={project.translationRequestId} mono />
            <MetaItem label="Locale" value={project.locale} />
            <MetaItem label="Created" value={project.creationDate} />
            <MetaItem label="Due" value={project.dueDate} />
            <MetaItem label="Delivered" value={project.deliveredAt} />
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-wider text-ink-3 font-medium mb-1">Word count</div>
            <div className="text-[32px] font-semibold tracking-tight text-ink-1 tabular-nums leading-none mb-3">
              {fmtNumber(project.totalWords || 0)}
            </div>
            <ScopingBreakdown scopingRaw={project.scopingRaw} />
          </div>

          <div className="flex flex-wrap gap-2">
            <a
              href={project.sourceDropboxUrl || undefined}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex items-center gap-2 h-9 px-4 rounded-md text-[13px] font-medium transition-colors duration-tab
                ${project.sourceDropboxUrl
                  ? 'bg-accent text-white hover:bg-[var(--accent-hover)]'
                  : 'bg-surface-2 text-ink-4 pointer-events-none'}`}
            >
              <Download className="w-3.5 h-3.5" /> Download source WSXZ
            </a>
            <a
              href={project.translatedDropboxUrl || undefined}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex items-center gap-2 h-9 px-4 rounded-md text-[13px] font-medium border transition-colors duration-tab
                ${project.translatedDropboxUrl
                  ? 'border-line-1 bg-surface-1 text-ink-1 hover:bg-surface-2'
                  : 'border-line-1 bg-surface-2 text-ink-4 pointer-events-none'}`}
            >
              <FileDown className="w-3.5 h-3.5" /> Download translated WSXZ
            </a>
          </div>

          <div>
            <div className="text-[12px] font-semibold text-ink-1 mb-3">Timeline</div>
            <WsTimeline project={project} />
          </div>

          <div className="border-t border-line-1 pt-5 space-y-3">
            <div className="text-[12px] font-semibold text-ink-1">Triage</div>
            <div>
              <label className="text-[11px] text-ink-3 font-medium block mb-1">Assigned PM</label>
              <input
                value={assignedPm}
                onChange={(e) => setAssignedPm(e.target.value)}
                placeholder="Unassigned"
                className="field-control w-full h-9 px-3 rounded-md border border-line-1 bg-surface-1 text-[13px] outline-none placeholder:text-ink-4"
              />
            </div>
            <div>
              <label className="text-[11px] text-ink-3 font-medium block mb-1">Internal note</label>
              <textarea
                value={internalNote}
                onChange={(e) => setInternalNote(e.target.value)}
                rows={3}
                placeholder="Notes for the team…"
                className="field-control w-full px-3 py-2 rounded-md border border-line-1 bg-surface-1 text-[13px] outline-none placeholder:text-ink-4 resize-y"
              />
            </div>
            <button
              onClick={save}
              disabled={!dirty || saving}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-accent text-white text-[13px] font-medium hover:bg-[var(--accent-hover)] transition-colors duration-tab disabled:opacity-40"
            >
              <Save className="w-3.5 h-3.5" /> {saving ? 'Saving…' : 'Save triage'}
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}