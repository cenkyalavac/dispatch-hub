import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import DynamicRuleForm from '@/components/rules/DynamicRuleForm';
import EmptyState from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { EM } from '@/lib/format';

export default function RulesTab({ portal }) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['rules-by-portal', portal.key],
    queryFn: () => base44.entities.Rule.filter({ portal: portal.key }, 'priority', 100),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['rules-by-portal', portal.key] });
    qc.invalidateQueries({ queryKey: ['rules-all'] });
    qc.invalidateQueries({ queryKey: ['rules-active'] });
  };

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }) => base44.entities.Rule.update(id, { is_active }),
    onSuccess: invalidate,
  });
  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Rule.delete(id),
    onSuccess: () => { toast.success('Rule deleted'); invalidate(); },
  });

  const handleClose = () => { setShowForm(false); setEditing(null); };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-[13px] text-ink-3 italic-editorial">
          What to accept, what to reject — applied to every task arriving from {portal.name}.
        </p>
        <button
          onClick={() => { setEditing(null); setShowForm(true); }}
          className="inline-flex items-center gap-2 h-9 px-4 rounded-md bg-accent text-white text-[13px] font-medium hover:bg-[var(--accent-hover)] transition-colors duration-tab"
        >
          <Plus className="w-4 h-4" /> New rule
        </button>
      </div>

      {showForm && (
        <div className="mb-6">
          <DynamicRuleForm
            rule={editing}
            portal={portal}
            onClose={handleClose}
            onSaved={invalidate}
          />
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : rules.length === 0 ? (
        <EmptyState
          title="No rules yet"
          body={`Add a rule to put ${portal.name} tasks on autopilot.`}
          cta={() => <><Plus className="w-4 h-4" /> New rule</>}
          action={() => { setEditing(null); setShowForm(true); }}
        />
      ) : (
        <div className="space-y-2">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className={`bg-surface-1 border border-line-1 rounded-md p-4 hover-surface transition-opacity ${!rule.is_active ? 'opacity-50' : ''}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-[14px] text-ink-1">{rule.name}</span>
                    <span className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${
                      rule.action === 'accept' ? 'text-success bg-success-soft' : 'text-danger bg-danger-soft'
                    }`}>
                      {rule.action === 'accept' ? 'Accept' : 'Reject'}
                    </span>
                    <span className="text-[11px] text-ink-3">priority {rule.priority ?? EM}</span>
                  </div>
                  {rule.conditions && rule.conditions.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {rule.conditions.map((c, i) => (
                        <span key={i} className="text-[11px] text-ink-2 bg-surface-2 px-2 py-0.5 rounded">
                          <span className="font-mono text-ink-3">{c.field}</span>
                          <span className="mx-1 text-ink-4">{c.operator}</span>
                          <span className="font-medium">{c.value || EM}</span>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[12px] text-ink-3 italic-editorial mt-1">No conditions — applies to every task.</p>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Switch
                    checked={rule.is_active}
                    onCheckedChange={() => toggleMutation.mutate({ id: rule.id, is_active: !rule.is_active })}
                  />
                  <button
                    onClick={() => { setEditing(rule); setShowForm(true); }}
                    className="inline-flex items-center justify-center h-8 w-8 rounded text-ink-3 hover:bg-surface-2 hover:text-ink-1 transition-colors duration-tab"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => { if (confirm(`Delete "${rule.name}"?`)) deleteMutation.mutate(rule.id); }}
                    className="inline-flex items-center justify-center h-8 w-8 rounded text-ink-3 hover:bg-danger-soft hover:text-danger transition-colors duration-tab"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}