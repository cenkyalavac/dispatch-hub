import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Mail } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

import NotificationRuleForm from '@/components/notifications/NotificationRuleForm';
import DeliveryRow from '@/components/notifications/DeliveryRow';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/ui/EmptyState';
import { EM } from '@/lib/format';

export default function Notifications() {
  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const qc = useQueryClient();

  const { data: portals = [] } = useQuery({
    queryKey: ['portals'],
    queryFn: () => base44.entities.Portal.list(),
  });

  const { data: rules = [], isLoading: rulesLoading } = useQuery({
    queryKey: ['notification-rules'],
    queryFn: () => base44.entities.NotificationRule.list('priority', 100),
  });

  // Last 30 deliveries — enough to see "did the last batch fire?". Auto-refresh
  // every 30s while the user is on the page so they see acceptances roll in.
  const { data: deliveries = [], isLoading: dLoading } = useQuery({
    queryKey: ['notification-deliveries'],
    queryFn: () => base44.entities.NotificationDelivery.list('-sent_at', 30),
    refetchInterval: 30_000,
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['notification-rules'] });
    qc.invalidateQueries({ queryKey: ['notification-deliveries'] });
  };

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.NotificationRule.update(id, data),
    onSuccess: invalidateAll,
  });
  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.NotificationRule.delete(id),
    onSuccess: () => { toast.success('Rule deleted'); invalidateAll(); },
  });

  const handleClose = () => {
    setShowForm(false); setEditingRule(null);
    invalidateAll();
  };

  const portalLabel = (key) => {
    if (key === '*') return 'Any portal';
    return portals.find(p => p.key === key)?.name || key;
  };

  return (
    <div className="px-8 py-7 max-w-4xl">
      <header className="flex items-end justify-between mb-7">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-ink-1">Notifications</h1>
          <p className="text-[13px] text-ink-3 mt-1 italic-editorial">
            When a new task arrives and no auto-accept rule picks it up, send an email with a one-click accept link.
          </p>
        </div>
        <button
          onClick={() => { setEditingRule(null); setShowForm(true); }}
          className="inline-flex items-center gap-2 h-9 px-4 rounded-md bg-accent text-white text-[13px] font-medium hover:bg-[var(--accent-hover)] transition-colors duration-tab"
        >
          <Plus className="w-4 h-4" /> New rule
        </button>
      </header>

      {showForm && (
        <div className="mb-6">
          <NotificationRuleForm rule={editingRule} portals={portals} onClose={handleClose} />
        </div>
      )}

      <section className="mb-8">
        <h2 className="text-[13px] font-semibold text-ink-2 mb-3">Rules</h2>
        {rulesLoading ? (
          <div className="space-y-2">{[1, 2].map(i => <Skeleton key={i} className="h-16" />)}</div>
        ) : rules.length === 0 ? (
          <EmptyState
            title="No notification rules yet"
            body="Create a rule to start receiving an email for every new task that needs a human decision."
            cta={() => <><Plus className="w-4 h-4" /> New rule</>}
            action={() => { setEditingRule(null); setShowForm(true); }}
          />
        ) : (
          <div className="space-y-2">
            {rules.map(rule => (
              <div
                key={rule.id}
                className={`bg-surface-1 border border-line-1 rounded-md p-4 hover-surface transition-opacity ${!rule.is_active ? 'opacity-50' : ''}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-[14px] text-ink-1">{rule.name}</span>
                      <span className="text-[10px] font-mono uppercase tracking-wider text-ink-4">{portalLabel(rule.portal)}</span>
                      <span className="text-[11px] text-ink-3">priority {rule.priority ?? EM}</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      <Mail className="w-3 h-3 text-ink-4" />
                      {(rule.recipients || []).map((r, i) => (
                        <span key={i} className="text-[11px] text-ink-2 bg-accent-soft text-accent-ink px-2 py-0.5 rounded">
                          {r}
                        </span>
                      ))}
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
                      <p className="text-[12px] text-ink-3 italic-editorial mt-1.5">No conditions — fires for every task.</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Switch
                      checked={rule.is_active}
                      onCheckedChange={() => updateMutation.mutate({ id: rule.id, data: { is_active: !rule.is_active } })}
                    />
                    <button
                      onClick={() => { setEditingRule(rule); setShowForm(true); }}
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
      </section>

      <section>
        <h2 className="text-[13px] font-semibold text-ink-2 mb-3">Recent deliveries</h2>
        {dLoading ? (
          <Skeleton className="h-32" />
        ) : deliveries.length === 0 ? (
          <p className="text-[12px] text-ink-3 italic-editorial">
            Nothing sent yet. Once a new task arrives that matches an active rule, you'll see it here.
          </p>
        ) : (
          <div className="bg-surface-1 border border-line-1 rounded-md overflow-hidden">
            {deliveries.map(d => <DeliveryRow key={d.id} delivery={d} />)}
          </div>
        )}
      </section>
    </div>
  );
}