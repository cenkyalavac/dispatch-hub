import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { CheckCircle2, RefreshCw, ChevronDown, ChevronUp, Calendar, Clock, Tag, Layers, FileText } from 'lucide-react';

function FinanceRowsTable({ rows }) {
  if (!rows || rows.length === 0) return <p className="text-xs text-muted-foreground italic">No finance rows</p>;

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-secondary/60 border-b">
            <th className="text-left px-3 py-2 font-medium text-muted-foreground">Unit</th>
            <th className="text-right px-3 py-2 font-medium text-muted-foreground">Qty</th>
            <th className="text-right px-3 py-2 font-medium text-muted-foreground">Unit Price</th>
            <th className="text-right px-3 py-2 font-medium text-muted-foreground">Min USD</th>
            <th className="text-right px-3 py-2 font-medium text-muted-foreground">Max USD</th>
            <th className="text-left px-3 py-2 font-medium text-muted-foreground">Name</th>
            <th className="text-center px-3 py-2 font-medium text-muted-foreground">Confirmed</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={`border-b last:border-0 ${i % 2 === 1 ? 'bg-secondary/20' : ''}`}>
              <td className="px-3 py-2 font-medium">
                <span className="bg-accent text-accent-foreground px-1.5 py-0.5 rounded text-xs">{r.billing_unit}</span>
              </td>
              <td className="px-3 py-2 text-right font-mono">{r.quantity?.toLocaleString() || '-'}</td>
              <td className="px-3 py-2 text-right font-mono">{r.unit_price_usd > 0 ? `$${r.unit_price_usd.toFixed(4)}` : '-'}</td>
              <td className="px-3 py-2 text-right font-mono text-muted-foreground">{r.min_usd > 0 ? `$${r.min_usd.toFixed(2)}` : '-'}</td>
              <td className="px-3 py-2 text-right font-mono font-medium">{r.max_usd > 0 ? `$${r.max_usd.toFixed(2)}` : '-'}</td>
              <td className="px-3 py-2 text-muted-foreground max-w-[150px] truncate">{r.name || '-'}</td>
              <td className="px-3 py-2 text-center">
                {r.is_confirmed
                  ? <span className="text-success">✓</span>
                  : <span className="text-muted-foreground">–</span>}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-secondary/50 font-semibold border-t-2">
            <td className="px-3 py-2 text-xs">TOTAL</td>
            <td className="px-3 py-2"></td>
            <td className="px-3 py-2"></td>
            <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">
              ${rows.reduce((s, r) => s + (r.min_usd || 0), 0).toFixed(2)}
            </td>
            <td className="px-3 py-2 text-right font-mono text-xs text-primary">
              ${rows.reduce((s, r) => s + (r.max_usd || 0), 0).toFixed(2)}
            </td>
            <td colSpan={2}></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export default function TaskDetailCard({ task, accepting, onAccept }) {
  const [expanded, setExpanded] = useState(false);

  const isOverdue = task.due_date && new Date(task.due_date) < new Date();

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm hover:shadow-md transition-shadow">
      {/* Header row */}
      <div className="flex items-start gap-4 p-4">
        {/* Main info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-foreground truncate">{task.name}</span>
            {task.service_tag && (
              <Badge variant="outline" className="text-xs flex-shrink-0">{task.service_tag}</Badge>
            )}
            {task.workflow_name && (
              <Badge className="text-xs bg-accent text-accent-foreground flex-shrink-0">{task.workflow_name}</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{task.project_name || 'No project'}</p>

          {/* Quick stats */}
          <div className="flex flex-wrap items-center gap-3 mt-2">
            {(task.source_language || task.target_language) && (
              <span className="text-xs font-mono bg-secondary px-2 py-0.5 rounded border">
                {task.source_language} → {task.target_language}
              </span>
            )}
            {task.word_count > 0 && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Layers className="w-3 h-3" />
                {task.word_count.toLocaleString()} words
              </span>
            )}
            {task.price_max_usd > 0 && (
              <span className="text-xs font-semibold text-primary">
                ${task.price_max_usd.toFixed(2)} max
                {task.price_min_usd > 0 && task.price_min_usd !== task.price_max_usd && (
                  <span className="font-normal text-muted-foreground ml-1">(min ${task.price_min_usd.toFixed(2)})</span>
                )}
              </span>
            )}
            {task.due_date && (
              <span className={`text-xs flex items-center gap-1 ${isOverdue ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                <Calendar className="w-3 h-3" />
                {format(new Date(task.due_date), 'dd MMM yyyy HH:mm')}
                {isOverdue && <span className="text-destructive">(overdue)</span>}
              </span>
            )}
            {task.created_at && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {format(new Date(task.created_at), 'dd MMM HH:mm')}
              </span>
            )}
            {task.finance_summary?.total_rows > 0 && (
              <span className="text-xs text-muted-foreground">
                {task.finance_summary.total_rows} finance row{task.finance_summary.total_rows !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            size="sm"
            variant="ghost"
            className="h-8 gap-1 text-muted-foreground"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            {expanded ? 'Hide' : 'Details'}
          </Button>
          <Button
            size="sm"
            className="h-8 bg-green-600 hover:bg-green-700 text-white gap-1"
            disabled={accepting}
            onClick={() => onAccept(task)}
          >
            {accepting
              ? <RefreshCw className="w-3 h-3 animate-spin" />
              : <CheckCircle2 className="w-3 h-3" />}
            Kabul Et
          </Button>
        </div>
      </div>

      {/* Expanded detail panel */}
      {expanded && (
        <div className="border-t border-border px-4 pb-4 pt-3 space-y-4">
          {/* Meta grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div>
              <p className="text-muted-foreground mb-0.5">Task ID</p>
              <p className="font-mono font-medium">{task.id}</p>
            </div>
            {task.task_type && (
              <div>
                <p className="text-muted-foreground mb-0.5">Task Type</p>
                <p className="font-medium">{task.task_type}</p>
              </div>
            )}
            {task.cat_tool && (
              <div>
                <p className="text-muted-foreground mb-0.5">CAT Tool</p>
                <p className="font-medium">{task.cat_tool}</p>
              </div>
            )}
            {task.assigned_to && (
              <div>
                <p className="text-muted-foreground mb-0.5">Assigned To</p>
                <p className="font-medium">{task.assigned_to}</p>
              </div>
            )}
            {task.updated_at && (
              <div>
                <p className="text-muted-foreground mb-0.5">Updated</p>
                <p className="font-medium">{format(new Date(task.updated_at), 'dd MMM yyyy HH:mm')}</p>
              </div>
            )}
            {task.project_id && (
              <div>
                <p className="text-muted-foreground mb-0.5">Project ID</p>
                <p className="font-mono font-medium">{task.project_id}</p>
              </div>
            )}
          </div>

          {(task.description || task.instructions) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {task.description && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1"><FileText className="w-3 h-3" /> Description</p>
                  <p className="text-xs bg-secondary/50 rounded p-2 leading-relaxed">{task.description}</p>
                </div>
              )}
              {task.instructions && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1"><Tag className="w-3 h-3" /> Instructions</p>
                  <p className="text-xs bg-secondary/50 rounded p-2 leading-relaxed">{task.instructions}</p>
                </div>
              )}
            </div>
          )}

          {/* Finance rows */}
          <div>
            <p className="text-xs font-semibold text-foreground mb-2">Finance Rows</p>
            <FinanceRowsTable rows={task.finance_rows} />
          </div>
        </div>
      )}
    </div>
  );
}