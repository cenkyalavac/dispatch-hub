import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Skeleton } from '@/components/ui/skeleton';
import { fmtNumber, EM } from '@/lib/format';
import { Users, FileText, Sparkles, Hash, CalendarDays } from 'lucide-react';
import { format } from 'date-fns';
import SymfonieAttachments from './SymfonieAttachments';

// Leverage band labels, in the order Symfonie's MemSource analyses report them.
// Same order as the AcceptedTask schema docstring.
const BANDS = [
  ['lev_context',   'Context'],
  ['lev_rep',       'Repetitions'],
  ['lev_match100',  '100%'],
  ['lev_9599',      '95–99%'],
  ['lev_8594',      '85–94%'],
  ['lev_7584',      '75–84%'],
  ['lev_5074',      '50–74%'],
  ['lev_no_match',  'No match'],
];

function LeverageGrid({ analysis }) {
  if (!analysis) return null;
  const total = BANDS.reduce((s, [k]) => s + (Number(analysis[k]) || 0), 0);
  if (total === 0) return (
    <p className="text-[12px] text-ink-3 italic-editorial">
      No word-count analysis attached to this task yet.
    </p>
  );
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {BANDS.map(([key, label]) => {
        const v = Number(analysis[key]) || 0;
        const pct = total > 0 ? (v / total) * 100 : 0;
        return (
          <div key={key} className="bg-surface-2 border border-line-1 rounded px-2 py-1.5">
            <p className="text-[10px] uppercase tracking-wider text-ink-3">{label}</p>
            <p className="text-[13px] font-semibold text-ink-1 tabular-nums">{fmtNumber(v)}</p>
            <p className="text-[10px] text-ink-4 tabular-nums">{pct.toFixed(0)}%</p>
          </div>
        );
      })}
    </div>
  );
}

function KV({ label, children }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-ink-3">{label}</p>
      <p className="text-[12px] text-ink-1 mt-0.5">{children}</p>
    </div>
  );
}

// Full Symfonie task detail panel — leverage breakdown, people, finance summary,
// custom fields, and the attachments list. Everything is lazy-loaded once the
// row is expanded (analysis + attachments come from separate Symfonie endpoints).
export default function SymfonieTaskDetail({ task }) {
  const { data: analysis, isLoading: analysisLoading } = useQuery({
    queryKey: ['symfonie-task-analysis', task.id],
    queryFn: async () => {
      const res = await base44.functions.invoke('symfonieGetTaskAnalysis', { task_id: task.id });
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
    enabled: !!task.id,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const requestors = task.requestors || [];
  const assignees = task.assignees || [];
  const customFields = task.custom_fields || {};
  const customEntries = Object.entries(customFields).filter(([, v]) => v !== '' && v != null);
  const fin = task.finance_summary || {};

  return (
    <div className="px-4 py-4 bg-surface-2/40 border-t border-line-1 space-y-4">
      {/* Leverage breakdown */}
      <div>
        <p className="text-[10px] uppercase tracking-wider text-ink-3 mb-2 inline-flex items-center gap-1.5">
          <Sparkles className="w-3 h-3" /> Word-count analysis
          {analysis?.parser_type && (
            <span className="text-ink-4 normal-case tracking-normal">· {analysis.parser_type}</span>
          )}
        </p>
        {analysisLoading ? (
          <div className="grid grid-cols-4 gap-1.5">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
          </div>
        ) : (
          <LeverageGrid analysis={analysis} />
        )}
      </div>

      {/* Identity / people */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {task.external_id && <KV label="External ID">{task.external_id}</KV>}
        {task.task_type && <KV label="Type">{task.task_type}</KV>}
        {task.state && <KV label="State">{task.state}</KV>}
        {task.order_date && (
          <KV label="Ordered">
            <span className="tabular-nums">{format(new Date(task.order_date), 'd MMM, HH:mm')}</span>
          </KV>
        )}
        {task.due_date && (
          <KV label="Due">
            <span className="tabular-nums">{format(new Date(task.due_date), 'd MMM, HH:mm')}</span>
          </KV>
        )}
        {requestors.length > 0 && (
          <KV label="Requestors">
            <span className="inline-flex items-center gap-1">
              <Users className="w-3 h-3 text-ink-3" /> {requestors.join(', ')}
            </span>
          </KV>
        )}
        {assignees.length > 0 && (
          <KV label="Assignees">
            <span className="inline-flex items-center gap-1">
              <Users className="w-3 h-3 text-ink-3" /> {assignees.join(', ')}
            </span>
          </KV>
        )}
        {task.workflow_group_name && task.workflow_group_name !== task.workflow_name && (
          <KV label="Workflow group">{task.workflow_group_name}</KV>
        )}
      </div>

      {/* Finance summary */}
      {(fin.total_rows > 0 || task.price_min_usd || task.price_max_usd) && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-ink-3 mb-2 inline-flex items-center gap-1.5">
            <Hash className="w-3 h-3" /> Finance
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[12px]">
            {fin.total_min_usd != null && (
              <KV label="Min (USD)"><span className="tabular-nums">${fmtNumber(Math.round(fin.total_min_usd))}</span></KV>
            )}
            {fin.total_max_usd != null && (
              <KV label="Max (USD)"><span className="tabular-nums">${fmtNumber(Math.round(fin.total_max_usd))}</span></KV>
            )}
            {fin.total_confirmed_usd > 0 && (
              <KV label="Confirmed"><span className="tabular-nums">${fmtNumber(Math.round(fin.total_confirmed_usd))}</span></KV>
            )}
            {fin.total_rows > 0 && (
              <KV label="Rows">{fmtNumber(fin.total_rows)} · {fin.billing_units?.join(', ') || EM}</KV>
            )}
          </div>
        </div>
      )}

      {/* Custom fields */}
      {customEntries.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-ink-3 mb-2 inline-flex items-center gap-1.5">
            <FileText className="w-3 h-3" /> Custom fields
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {customEntries.map(([k, v]) => (
              <KV key={k} label={k}>{String(v)}</KV>
            ))}
          </div>
        </div>
      )}

      {/* Attachments (existing component — handles its own data fetching) */}
      <SymfonieAttachments taskId={task.id} />
    </div>
  );
}