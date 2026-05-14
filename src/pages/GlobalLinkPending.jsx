import { useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Inbox, RefreshCw, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import SubmissionTableRow from '@/components/globallink/SubmissionTableRow';

const AUTO_FETCH_LIMIT = 10; // First N rows auto-load their leverage on page open.

export default function GlobalLinkPending() {
  const qc = useQueryClient();
  const [busyMap, setBusyMap] = useState({});        // { [rowId]: 'approve' | 'skip' }
  const [leverageBusy, setLeverageBusy] = useState({}); // { [rowId]: true }
  const autoFetchedRef = useRef(new Set());            // Rows we've already auto-fetched.

  const { data: rows = [], isLoading, isFetching } = useQuery({
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

  const setBusy = (id, action) => setBusyMap((m) => ({ ...m, [id]: action }));
  const clearBusy = (id) => setBusyMap((m) => { const n = { ...m }; delete n[id]; return n; });

  const fetchLeverageFor = async (row) => {
    setLeverageBusy((m) => ({ ...m, [row.id]: true }));
    try {
      const res = await base44.functions.invoke('globallinkLeverage', {
        submission_ticket: row.submission_ticket,
        source_language: row.source_language,
      });
      if (res.data?.success) {
        qc.invalidateQueries({ queryKey: ['globallink-submissions'] });
      } else if (!res.data?.skipped) {
        toast.error('Leverage fetch failed: ' + (res.data?.error || 'unknown'));
      }
    } catch (err) {
      toast.error('Leverage fetch failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setLeverageBusy((m) => { const n = { ...m }; delete n[row.id]; return n; });
    }
  };

  // Auto-fetch leverage for first N rows that don't already have it.
  useEffect(() => {
    if (!rows.length) return;
    const targets = rows
      .slice(0, AUTO_FETCH_LIMIT)
      .filter((r) => !r.leverage && !autoFetchedRef.current.has(r.id));
    if (targets.length === 0) return;
    targets.forEach((r) => autoFetchedRef.current.add(r.id));
    // Fire sequentially to avoid hammering the broker.
    (async () => {
      for (const r of targets) {
        await fetchLeverageFor(r);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const handleApprove = async (row) => {
    setBusy(row.id, 'approve');
    try {
      const res = await base44.functions.invoke('globallinkApproveOne', {
        submission_row_id: row.id,
        submission_ticket: row.submission_ticket,
      });
      if (res.data?.success) {
        toast.success(`Accepted: ${row.submission_name || row.submission_ticket}`);
        qc.invalidateQueries({ queryKey: ['globallink-submissions'] });
      } else {
        toast.error('Accept failed: ' + (res.data?.error || 'unknown'));
        qc.invalidateQueries({ queryKey: ['globallink-submissions'] });
      }
    } catch (err) {
      // Surface the real backend error body (status + message) instead of axios's generic 404.
      const status = err.response?.status;
      const backendErr = err.response?.data?.error;
      const msg = backendErr
        ? `${backendErr}${status ? ` (HTTP ${status})` : ''}`
        : err.message;
      toast.error('Accept failed: ' + msg);
      // Row may be stale (deleted, claimed elsewhere) — refresh the list.
      qc.invalidateQueries({ queryKey: ['globallink-submissions'] });
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

  return (
    <div className="p-8 max-w-[1400px]">
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-accent text-accent-foreground text-xs font-medium mb-2">
            <Globe className="w-3 h-3" />
            GlobalLink PD
          </div>
          <h1 className="text-2xl font-bold text-foreground">Available Submissions</h1>
          <p className="text-muted-foreground text-sm mt-1">
            First {AUTO_FETCH_LIMIT} rows auto-load TM leverage. Use “Fetch leverage” for the rest.
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
          {[1, 2, 3].map((i) => <div key={i} className="skel h-10 w-full" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="border border-dashed border-line-2 rounded-lg p-12 text-center">
          <Inbox className="w-10 h-10 mx-auto mb-3 text-ink-4" />
          <p className="text-sm italic-editorial text-ink-3">No available submissions right now.</p>
          <p className="text-xs text-ink-3 mt-1">The poller runs every 5 minutes — or click Poll now.</p>
        </div>
      ) : (
        <div className="border border-line-1 rounded-lg overflow-x-auto bg-surface-1">
          {isFetching && <div className="px-3 py-1 text-[11px] text-ink-3 border-b border-line-1">Refreshing…</div>}
          <table className="w-full text-left">
            <thead className="bg-surface-2/60 border-b border-line-1">
              <tr className="text-[10px] uppercase tracking-wide text-ink-3">
                <th className="px-2 py-2 font-medium">Account</th>
                <th className="px-2 py-2 font-medium">Submission ID</th>
                <th className="px-2 py-2 font-medium">Task Name</th>
                <th className="px-2 py-2 font-medium text-right">Context</th>
                <th className="px-2 py-2 font-medium text-right">100%</th>
                <th className="px-2 py-2 font-medium text-right">Rep</th>
                <th className="px-2 py-2 font-medium text-right">95-99</th>
                <th className="px-2 py-2 font-medium text-right">85-94</th>
                <th className="px-2 py-2 font-medium text-right">75-84</th>
                <th className="px-2 py-2 font-medium text-right">50-74</th>
                <th className="px-2 py-2 font-medium text-right">No Match</th>
                <th className="px-2 py-2 font-medium text-right">Total WC</th>
                <th className="px-2 py-2 font-medium">TR Deadline</th>
                <th className="px-2 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <SubmissionTableRow
                  key={row.id}
                  row={row}
                  onApprove={handleApprove}
                  onSkip={handleSkip}
                  onFetchLeverage={fetchLeverageFor}
                  busyAction={busyMap[row.id]}
                  leverageBusy={leverageBusy[row.id]}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}