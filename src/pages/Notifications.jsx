import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Mail, Inbox, Settings as SettingsIcon, Send, CheckCheck } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

import NotificationRuleForm from '@/components/notifications/NotificationRuleForm';
import DeliveryRow from '@/components/notifications/DeliveryRow';
import InboxRow from '@/components/notifications/InboxRow';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/ui/EmptyState';
import { EM } from '@/lib/format';

export default function Notifications() {
  const [params, setParams] = useSearchParams();
  const activeTab = params.get('tab') || 'inbox';
  const setTab = (t) => setParams({ tab: t });

  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const qc = useQueryClient();

  const { data: portals = [] } = useQuery({
    queryKey: ['portals'],
    queryFn: () => base44.entities.Portal.list(),
  });

  const { data: inbox = [], isLoading: inboxLoading } = useQuery({
    queryKey: ['user-notifications'],
    queryFn: () => base44.entities.UserNotification.list('-created_date', 100),
    refetchInterval: 60_000,
  });

  const { data: rules = [], isLoading: rulesLoading } = useQuery({
    queryKey: ['notification-rules'],
    queryFn: () => base44.entities.NotificationRule.list('priority', 100),
  });

  const { data: deliveries = [], isLoading: dLoading } = useQuery({
    queryKey: ['notification-deliveries'],
    queryFn: () => base44.entities.NotificationDelivery.list('-sent_at', 30),
    refetchInterval: 30_000,
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['notification-rules'] });
    qc.invalidateQueries({ queryKey: ['notification-deliveries'] });
    qc.invalidateQueries({ queryKey: ['user-notifications'] });
    qc.invalidateQueries({ queryKey: ['user-notifications-unread'] });
  };

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.NotificationRule.update(id, data),
    onSuccess: invalidateAll,
  });
  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.NotificationRule.delete(id),
    onSuccess: () => { toast.success('Rule deleted'); invalidateAll(); },
  });

  const markRead = async (n) => {
    await base44.entities.UserNotification.update(n.id, { read_at: new Date().toISOString() });
    qc.invalidateQueries({ queryKey: ['user-notifications'] });
    qc.invalidateQueries({ queryKey: ['user-notifications-unread'] });
  };

  const markAllRead = async () => {
    const unread = inbox.filter(n => !n.read_at);
    if (unread.length === 0) return;
    const now = new Date().toISOString();
    await Promise.all(unread.map(n => base44.entities.UserNotification.update(n.id, { read_at: now })));
    qc.invalidateQueries({ queryKey: ['user-notifications'] });
    qc.invalidateQueries({ queryKey: ['user-notifications-unread'] });
    toast.success(`Marked ${unread.length} as read`);
  };

  const handleClose = () => {
    setShowForm(false); setEditingRule(null);
    invalidateAll();
  };

  const portalLabel = (key) => {
    if (key === '*') return 'Any portal';
    return portals.find(p => p.key === key)?.name || key;
  };

  const unreadCount = useMemo(() => inbox.filter(n => !n.read_at).length, [inbox]);

  const tabBtn = (key, label, Icon, badge) => {
    const active = activeTab === key;
    return (
      <button
        onClick={() => setTab(key)}
        className={`relative h-9 px-4 inline-flex items-center gap-2 text-[13px] font-medium rounded-md transition-colors duration-tab
          ${active ? 'text-ink-1 bg-surface-2' : 'text-ink-3 hover:text-ink-1 hover:bg-surface-2'}`}
      >
        <Icon className="w-3.5 h-3.5" />
        {label}
        {badge != null && badge > 0 && (
          <span className="ml-1 min-w-[18px] h-[18px] px-1 rounded-full bg-accent text-white text-[10px] font-semibold flex items-center justify-center tabular-nums">
            {badge}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="px-8 py-7 max-w-4xl">
      <header className="flex items-end justify-between mb-5">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-ink-1">Notifications</h1>
          <p className="text-[13px] text-ink-3 mt-1 italic-editorial">
            In-app alerts for due-date changes and other events, plus the email rules that route new tasks to humans.
          </p>
        </div>
        {activeTab === 'rules' && (
          <button
            onClick={() => { setEditingRule(null); setShowForm(true); }}
            className="inline-flex items-center gap-2 h-9 px-4 rounded-md bg-accent text-white text-[13px] font-medium hover:bg-[var(--accent-hover)] transition-colors duration-tab"
          >
            <Plus className="w-4 h-4" /> New rule
          </button>
        )}
      </header>

      <div className="flex items-center gap-1 mb-6 border-b border-line-1 pb-3">
        {tabBtn('inbox', 'Inbox', Inbox, unreadCount)}
        {tabBtn('rules', 'Email rules', SettingsIcon)}
        {tabBtn('deliveries', 'Deliveries', Send)}
      </div>

      {activeTab === 'inbox' && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[13px] font-semibold text-ink-2">Recent activity</h2>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="inline-flex items-center gap-1.5 h-7 px-3 rounded text-[12px] text-ink-3 hover:text-ink-1 hover:bg-surface-2 transition-colors duration-tab"
              >
                <CheckCheck className="w-3.5 h-3.5" /> Mark all read
              </button>
            )}
          </div>
          {inboxLoading ? (
            <Skeleton className="h-32" />
          ) : inbox.length === 0 ? (
            <EmptyState
              title="Inbox is empty"
              body="When Symfonie pushes a new due date on a task you've already accepted (or other changes happen), you'll see them here."
            />
          ) : (
            <div className="bg-surface-1 border border-line-1 rounded-md overflow-hidden">
              {inbox.map(n => <InboxRow key={n.id} n={n} onMarkRead={markRead} />)}
            </div>
          )}
        </section>
      )}

      {activeTab === 'rules' && (
        <>
          {showForm && (
            <div className="mb-6">
              <NotificationRuleForm rule={editingRule} portals={portals} onClose={handleClose} />
            </div>
          )}
          <section>
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
        </>
      )}

      {activeTab === 'deliveries' && (
        <section>
          {dLoading ? (
            <Skeleton className="h-32" />
          ) : deliveries.length === 0 ? (
            <EmptyState
              title="No deliveries yet"
              body="Once a new task arrives that matches an active rule, the email send log will show up here."
            />
          ) : (
            <div className="bg-surface-1 border border-line-1 rounded-md overflow-hidden">
              {deliveries.map(d => <DeliveryRow key={d.id} delivery={d} />)}
            </div>
          )}
        </section>
      )}
    </div>
  );
}