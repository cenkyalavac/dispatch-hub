import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, FileText, Megaphone, User } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import JunctionLeveragePanel from './JunctionLeveragePanel';

// Junction task detail panel — notes + assets pulled lazily on first render.
// Cached by react-query so re-opening the same task is instant. Asset download
// URLs are fetched only when the user clicks (refresh-urls is rate-limited).

function NoteRow({ note }) {
  const isInstruction = note.type === 'instruction';
  return (
    <li className={`text-[12px] p-2 rounded border ${isInstruction ? 'bg-accent-soft border-accent/30' : 'bg-surface-2 border-line-1'}`}>
      <div className="flex items-center gap-2 mb-1">
        {isInstruction ? <Megaphone className="w-3 h-3 text-accent-ink" /> : <FileText className="w-3 h-3 text-ink-3" />}
        <span className="text-[10px] uppercase tracking-wider text-ink-3">{note.type}</span>
        {note.acknowledged && <span className="text-[9px] uppercase tracking-wider text-success bg-success-soft px-1 py-0.5 rounded">acked</span>}
      </div>
      <p className="leading-relaxed text-ink-2 whitespace-pre-wrap">{note.value}</p>
    </li>
  );
}

function AssetRow({ asset, taskId }) {
  const [busy, setBusy] = useState(false);

  const handleDownload = async () => {
    setBusy(true);
    try {
      const res = await base44.functions.invoke('junctionGetTaskDetail', { task_id: taskId, asset_id: asset.id });
      if (res.data?.success && res.data.download_url) {
        window.open(res.data.download_url, '_blank', 'noopener,noreferrer');
      } else {
        toast.error(res.data?.error || 'No download URL returned');
      }
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="flex items-center gap-3 text-[12px] p-2 rounded border border-line-1 bg-surface-2">
      <FileText className="w-3.5 h-3.5 text-ink-3 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-ink-1 truncate" title={asset.name}>{asset.name || `Asset #${asset.id}`}</p>
        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-ink-3">
          <span className="uppercase tracking-wider">{asset.kind}</span>
          {asset.locale && <span className="font-mono">{asset.locale}</span>}
          {asset.is_qc_form && <span className="text-warning">QC form</span>}
        </div>
      </div>
      <button
        onClick={handleDownload}
        disabled={busy}
        className="inline-flex items-center gap-1 h-7 px-2 rounded text-[11px] border border-line-1 bg-surface-1 text-ink-2 hover:bg-surface-2 hover:text-ink-1 transition-colors duration-tab disabled:opacity-40"
      >
        <Download className="w-3 h-3" />
        {busy ? 'Opening…' : 'Open'}
      </button>
    </li>
  );
}

export default function JunctionTaskDetail({ taskId }) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['junction-task-detail', taskId],
    queryFn: async () => {
      const res = await base44.functions.invoke('junctionGetTaskDetail', { task_id: taskId });
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
    enabled: !!taskId,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  if (!taskId) {
    return (
      <div className="text-[12px] text-ink-3 italic-editorial">
        No Junction task id on this offer — detail unavailable.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-[12px] text-danger bg-danger-soft border border-danger/20 rounded p-2">
        Junction detail failed: {error?.message || 'unknown error'}
      </div>
    );
  }

  const notes = data?.notes || [];
  const assets = data?.assets || [];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-[11px] text-ink-3">
        <span className="uppercase tracking-wider">From Junction</span>
        {data?.assigned_user && (
          <span className="inline-flex items-center gap-1">
            <User className="w-3 h-3" /> {data.assigned_user}
          </span>
        )}
      </div>

      {data?.leverage && <JunctionLeveragePanel leverage={data.leverage} />}

      <div>
        <p className="text-[10px] uppercase tracking-wider text-ink-3 mb-1.5">
          Notes & instructions {notes.length > 0 && <span className="text-ink-4">({notes.length})</span>}
        </p>
        {notes.length === 0 ? (
          <p className="text-[12px] text-ink-3 italic-editorial">No notes on this task.</p>
        ) : (
          <ul className="space-y-1.5">{notes.map((n) => <NoteRow key={n.id} note={n} />)}</ul>
        )}
      </div>

      <div>
        <p className="text-[10px] uppercase tracking-wider text-ink-3 mb-1.5">
          Assets {assets.length > 0 && <span className="text-ink-4">({assets.length})</span>}
        </p>
        {assets.length === 0 ? (
          <p className="text-[12px] text-ink-3 italic-editorial">No assets on this task.</p>
        ) : (
          <ul className="space-y-1.5">{assets.map((a) => <AssetRow key={a.id} asset={a} taskId={taskId} />)}</ul>
        )}
      </div>
    </div>
  );
}