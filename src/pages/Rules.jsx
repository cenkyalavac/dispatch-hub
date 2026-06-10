import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

import RuleForm from '@/components/rules/RuleForm';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/ui/EmptyState';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { EM } from '@/lib/format';

export default function Rules() {
  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [portalFilter, setPortalFilter] = useState('all');
  const [confirmState, setConfirmState] = useState(null);
  const qc = useQueryClient();

  const { data: portals = [] } = useQuery({
    queryKey: ['portals'],
    queryFn: () => base44.entities.Portal.list(),
  });
  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['rules-all', portalFilter],
    queryFn: () =>
      portalFilter === 'all'
        ? base44.entities.Rule.list('priority', 100)
        : base44.entities.Rule.filter({ portal: portalFilter }, 'priority', 100),
  });

  // Bug fix: toggling/deleting/saving a rule on this page didn't refresh the active-rules count
  // shown on the Dashboard. Invalidate both query keys whenever rules change.
  const invalidateAllRuleQueries = () => {
    qc.invalidateQueries({ queryKey: ['rules-all'] });
    qc.invalidateQueries({ queryKey: ['rules-active'] });
  };

  const updateMutation = useMutation({
    mutationFn: (/** @type {{ id: string, data: Record<string, any> }} */ { id, data }) => base44.entities.Rule.update(id, data),
    onSuccess: invalidateAllRuleQueries,
  });
  const deleteMutation = useMutation({
    mutationFn: (/** @type {string} */ id) => base44.entities.Rule.delete(id),
    onSuccess: () => { toast.success('Rule deleted'); invalidateAllRuleQueries(); },
  });

  const handleClose = () => {
    setShowForm(false); setEditingRule(null);
    invalidateAllRuleQueries();
  };

  return (
    <div className="px-8 py-7 max-w-4xl">
      <header className="flex items-end justify-between mb-7">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-ink-1">Rules</h1>
          <p className="text-[13px] text-ink-3 mt-1 italic-editorial">
            What to accept, what to reject — declared once, applied always.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={portalFilter}
            onChange={(e) => setPortalFilter(e.target.value)}
            className="field-control h-9 px-3 rounded-md border border-line-1 bg-surface-1 text-[13px] text-ink-1 outline-none"
          >
            <option value="all">All portals</option>
            {portals.map(p => <option key={p.key} value={p.key}>{p.name}</option>)}
          </select>
          <button
            onClick={() => { setEditingRule(null); setShowForm(true); }}
            className="inline-flex items-center gap-2 h-9 px-4 rounded-md bg-accent text-white text-[13px] font-medium hover:bg-[var(--accent-hover)] transition-colors duration-tab"
          >
            <Plus className="w-4 h-4" /> New rule
          </button>
        </div>
      </header>

      {showForm && (
        <div className="mb-6">
          <RuleForm rule={editingRule} portals={portals} onClose={handleClose} />
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-16" />)}
        </div>
      ) : rules.length === 0 ? (
        <EmptyState
          title="No rules defined"
          body="A rule listens for a pattern and decides — accept this, reject that. Create one to put your hub on autopilot."
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
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-[14px] text-ink-1">{rule.name}</span>
                    <span className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${
                      rule.action === 'accept' ? 'text-success bg-success-soft' : 'text-danger bg-danger-soft'
                    }`}>
                      {rule.action === 'accept' ? 'Accept' : 'Reject'}
                    </span>
                    <span className="text-[10px] font-mono uppercase tracking-wider text-ink-4">{rule.portal || 'symfonie'}</span>
                    <span className="text-[11px] text-ink-3">priority {rule.priority ?? EM}</span>
                  </div>
                  {rule.conditions && rule.conditions.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      {rule.conditions.map((c, i) => (
                        <span key={i} className="inline-flex items-center gap-1.5 text-[11px] bg-surface-2 border border-line-1 rounded-md pl-2 pr-2 py-1">
                          <span className="font-medium text-ink-1">{c.field}</span>
                          <span className="font-mono text-[10px] text-accent-ink bg-accent-soft px-1.5 py-0.5 rounded">{c.operator}</span>
                          <span className="font-medium text-ink-1">{c.value || EM}</span>
                          {i < rule.conditions.length - 1 && (
                            <span className="ml-0.5 text-[9px] uppercase tracking-wider text-ink-4 font-semibold">and</span>
                          )}
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
                    onCheckedChange={() => updateMutation.mutate({ id: rule.id, data: { is_active: !rule.is_active } })}
                  />
                  <button
                    onClick={() => { setEditingRule(rule); setShowForm(true); }}
                    className="inline-flex items-center justify-center h-8 w-8 rounded text-ink-3 hover:bg-surface-2 hover:text-ink-1 transition-colors duration-tab"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setConfirmState({
                      title: `Delete "${rule.name}"?`,
                      body: 'This rule will stop being applied to incoming tasks. This cannot be undone.',
                      confirmLabel: 'Delete',
                      danger: true,
                      onConfirm: () => deleteMutation.mutate(rule.id),
                    })}
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

      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
    </div>
  );
}