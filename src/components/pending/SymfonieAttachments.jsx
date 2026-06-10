import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, FileText, Paperclip } from 'lucide-react';
import { format, isValid } from 'date-fns';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { fmtNumber } from '@/lib/format';

// Symfonie attachment panel — mirrors JunctionTaskDetail.
//
// Listing is JSON (cheap, cached). Download is a separate request that streams
// the file bytes through the symfonieAttachments function (Symfonie needs a
// Bearer token, so we can't link to the raw URL from the browser).

// FileType enum (Symfonie /Api/help/V5/enum/FileType):
//   0=Other, 1=Reference, 2=Source, 3=Target, 4=Analysis
// Each kind gets a color cue so reviewers can scan a task's HO bundle at a glance:
// source files are the deliverables, references are the brief, analysis is WC.
const KIND_STYLE = {
  source:    'bg-accent-soft text-accent-ink border-accent/20',
  target:    'bg-success-soft text-success border-success/20',
  reference: 'bg-surface-3 text-ink-2 border-line-2',
  analysis:  'bg-warning-soft text-warning border-warning/20',
  other:     'bg-surface-2 text-ink-3 border-line-1',
};

function fmtBytes(n) {
  if (!n || n <= 0) return null;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function safeDateShort(value) {
  if (!value) return null;
  const d = new Date(value);
  return isValid(d) ? format(d, 'd MMM') : null;
}

function AttachmentRow({ att, taskId }) {
  const [busy, setBusy] = useState(false);

  // Download flow: stream the bytes via functions.fetch() (raw Response),
  // then trigger a synthetic <a download> click. We do NOT navigate the user
  // away or open a new tab — keeps the pending list scroll position intact.
  //
  // invoke() can't be used here: its 2-arg signature has no per-call axios
  // options, so the response always goes through the default JSON/text
  // transform which corrupts binary payloads.
  const handleDownload = async () => {
    setBusy(true);
    try {
      const res = await base44.functions.fetch('symfonieAttachments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: taskId, attachment_id: att.id }),
      });
      // When the backend errors it returns JSON, not file bytes — detect that.
      const ct = res.headers.get('content-type') || '';
      if (!res.ok || ct.includes('application/json')) {
        const parsed = await res.json().catch(() => null);
        throw new Error(parsed?.error || 'Download failed');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = att.name || `attachment_${att.id}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Revoke after a tick so the browser has time to start the download.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      toast.error(e.message || 'Download failed');
    } finally {
      setBusy(false);
    }
  };

  const sizeStr = fmtBytes(att.size);
  const dateStr = safeDateShort(att.uploaded_at);

  return (
    <li className="flex items-center gap-3 text-[12px] p-2 rounded border border-line-1 bg-surface-2">
      <FileText className="w-3.5 h-3.5 text-ink-3 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-ink-1 truncate" title={att.name}>{att.name || `Attachment #${att.id}`}</p>
        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-ink-3">
          {att.kind && (
            <span className={`uppercase tracking-wider px-1.5 py-0.5 rounded border ${KIND_STYLE[att.kind] || KIND_STYLE.other}`}>
              {att.kind}
            </span>
          )}
          {sizeStr && <span className="tabular-nums">{sizeStr}</span>}
          {dateStr && <span>{dateStr}</span>}
          {att.uploaded_by && <span className="font-mono truncate max-w-[140px]" title={att.uploaded_by}>{att.uploaded_by}</span>}
        </div>
      </div>
      <button
        onClick={handleDownload}
        disabled={busy}
        className="inline-flex items-center gap-1 h-7 px-2 rounded text-[11px] border border-line-1 bg-surface-1 text-ink-2 hover:bg-surface-2 hover:text-ink-1 transition-colors duration-tab disabled:opacity-40"
      >
        <Download className="w-3 h-3" />
        {busy ? 'Downloading…' : 'Download'}
      </button>
    </li>
  );
}

export default function SymfonieAttachments({ taskId }) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['symfonie-attachments', taskId],
    queryFn: async () => {
      const res = await base44.functions.invoke('symfonieAttachments', { task_id: taskId });
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
    enabled: !!taskId,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  if (!taskId) return null;

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-[12px] text-danger bg-danger-soft border border-danger/20 rounded p-2">
        Attachments failed: {error?.message || 'unknown error'}
      </div>
    );
  }

  const attachments = data?.attachments || [];

  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-ink-3 mb-1.5 inline-flex items-center gap-1.5">
        <Paperclip className="w-3 h-3" />
        Attachments {attachments.length > 0 && <span className="text-ink-4">({fmtNumber(attachments.length)})</span>}
      </p>
      {attachments.length === 0 ? (
        <p className="text-[12px] text-ink-3 italic-editorial">No attachments on this task.</p>
      ) : (
        <ul className="space-y-1.5">
          {attachments.map((a) => <AttachmentRow key={a.id} att={a} taskId={taskId} />)}
        </ul>
      )}
    </div>
  );
}