import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Inbox, RefreshCw, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import SubmissionRow from '@/components/globallink/SubmissionRow';

export default function GlobalLinkPending() {
  const qc = useQueryClient();
  const [busyMap, setBusyMap] = useState({}); // { [rowId]: 'approve' | 'skip' }

  const { data: rows = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['globallink-submissions'],
    queryFn: () => base44.entities.GlobalLinkSubmission.filter({ status: 'available' }, '-created_date', 200),
  });

  const pollMutation = useMutation({
    mutationFn: () => base44.functions.invoke('globallinkPoll', {}),
    onSuccess: (res) => {
      const summary = res?.data?.summary;
      if (res?.data?.skipped) {
        toast.warning('GlobalLink portal is disabled — toggle it on in Connectors.');
      } else if (summary) {
        toast.success(`Polled: ${summary.created} new, ${summary.updated} updated`);
      }
      qc.invalidateQueries({ queryKey: ['globallink-submissions'] });
    },
    onError: (err) => toast.error('Poll failed: ' + (err.response?.data?.error || err.message)),
  });

  const setBusy = (id, action) =>
    setBusyMap((m) => ({ ...m, [id]: action }));
  const clearBusy = (id) =>
    setBusyMap((m) => { const n = { ...m }; delete n[id]; return n; });

  const handleApprove = async (row) => {
    setBusy(row.id, 'approve');
    try {
      const res = await base44.functions.invoke('globallinkApproveOne', { submission_row_id: row.id });
      if (res.data?.success) {
        toast.success(`Accepted: ${row.submission_name || row.submission_ticket}`);
        qc.invalidateQueries({ queryKey: ['globallink-submissions'] });
      } else {
        toast.error('Accept failed: ' + (res.data?.error || 'unknown'));
      }
    } catch (err) {
      toast.error('Accept failed: ' + (err.response?.data?.error || err.message));
    } finally {
      clearBusy(row.id);
    }
  };

  const handleSkip = async (row) => {
    setBusy(row.id, 'skip');
    try {
      await base44.entities.GlobalLinkSubmission.update(row.id, { status: 'skipped' });
      toast.success(`Skipped: ${row.submission_name || row.submission_ticket}`);
      qc.invalidateQueries({ queryKey: ['globallink-submissions'] });
    } catch (err) {
      toast.error('Skip failed: ' + err.message);
    } finally {
      clearBusy(row.id);
    }
  };

  const handleFetchLeverage = async (row) => {
    try {
      const res = await base44.functions.invoke('globallinkLeverage', {
        submission_ticket: row.submission_ticket,
        source_language: row.source_language,
      });
      if (res.data?.success) {
        qc.invalidateQueries({ queryKey: ['globallink-submissions'] });
      } else {
        toast.error('Leverage fetch failed: ' + (res.data?.error || 'unknown'));
      }
    } catch (err) {
      toast.error('Leverage fetch failed: ' + (err.response?.data?.error || err.message));
    }
  };

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-accent text-accent-foreground text-xs font-medium mb-2">
            <Globe className="w-3 h-3" />
            GlobalLink PD
          </div>
          <h1 className="text-2xl font-bold text-foreground">Available Submissions</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Claimable submissions polled from GlobalLink Project Director. Accept to claim, Skip to hide.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => pollMutation.mutate()}
          disabled={pollMutation.isPending}
          className="gap-2"
        >
          {pollMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Poll now
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="skel h-20 w-full" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="border border-dashed border-line-2 rounded-lg p-12 text-center">
          <Inbox className="w-10 h-10 mx-auto mb-3 text-ink-4" />
          <p className="text-sm italic-editorial text-ink-3">No available submissions right now.</p>
          <p className="text-xs text-ink-3 mt-1">The poller runs every 5 minutes — or click Poll now.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {isFetching && <div className="text-xs text-ink-3">Refreshing…</div>}
          {rows.map((row) => (
            <SubmissionRow
              key={row.id}
              row={row}
              onApprove={handleApprove}
              onSkip={handleSkip}
              onFetchLeverage={handleFetchLeverage}
              busyAction={busyMap[row.id]}
            />
          ))}
        </div>
      )}
    </div>
  );
}