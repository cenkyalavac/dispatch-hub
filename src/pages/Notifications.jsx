import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Mail, Inbox, Settings as SettingsIcon, Send, CheckCheck, Bell } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

import NotificationRuleForm from '@/components/notifications/NotificationRuleForm';
import EventRuleForm from '@/components/notifications/EventRuleForm';
import EventRuleRow from '@/components/notifications/EventRuleRow';
import DeliveryRow from '@/components/notifications/DeliveryRow';
import InboxRow from '@/components/notifications/InboxRow.jsx';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/ui/EmptyState';
import { EM } from '@/lib/format';

export default function Notifications() {
  const [params, setParams] = useSearchParams();
  const activeTab = params.get('tab') || 'inbox';
  const setTab = (t) => setParams({ tab: t });

  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  // Separate state for the new NotificationSetting (event rules) tab so the
  // two forms can't accidentally share an edit target.
  const [showEventForm, setShowEventForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const qc = useQueryClient();

  const { data: portals = [] } = useQuery({
    queryKey: ['portals'],
    queryFn: () => base44.entities.Portal.list(),
  });

  // Inbox and the top-bar NotificationBell share this query key so a new
  // notification appearing on the bell instantly updates the inbox tab and
  // vice-versa (no two separate polls drifting out of sync).
  const { data: inbox = [], isLoading: inboxLoading } = useQuery({
    queryKey: ['user-notifications'],
    queryFn: () => base44.entities.UserNotification.list('-created_date', 100),
    refetchInterval: 30_000,
  });

  const { data: rules = [], isLoading: rulesLoading } = useQuery({
    queryKey: ['notification-rules'],
    queryFn: () => base44.entities.NotificationRule.list('priority', 100),
  });

  const { data: eventRules = [], isLoading: eventRulesLoading } = useQuery({
    queryKey: ['notification-settings'],
    queryFn: () => base44.entities.NotificationSetting.list('created_date', 100),
  });

  const { data: deliveries = [], isLoading: dLoading } = useQuery({
    queryKey: ['notification-deliveries'],
    queryFn: () => base44.entities.NotificationDelivery.list('-sent_at', 30),
    refetchInterval: 30_000,
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['notification-rules'] });
    qc.invalidateQueries({ queryKey: ['notification-settings'] });
    qc.invalidateQueries({ queryKey: ['notification-deliveries'] });
    qc.invalidateQueries({ queryKey: ['user-notifications'] });
    qc.invalidateQueries({ queryKey: ['user-notifications-unread'] });
  };

  const updateMutation = useMutation({
    mutationFn: (/** @type {{ id: string, data: Record<string, any> }} */ { id, data }) => base44.entities.NotificationRule.update(id, data),
    onSuccess: invalidateAll,
  });
  const deleteMutation = useMutation({
    mutationFn: (/** @type {string} */ id) => base44.entities.NotificationRule.delete(id),
    onSuccess: () => { toast.success('Rule deleted'); invalidateAll(); },
  });

  // NotificationSetting (event rules) — toggle/delete mutations. Edit goes
  // through EventRuleForm's own save mutation so we don't duplicate it here.
  const settingToggleMutation = useMutation({
    mutationFn: (/** @type {{ id: string, data: Record<string, any> }} */ { id, data }) => base44.entities.NotificationSetting.update(id, data),
    onSuccess: invalidateAll,
  });
  const settingDeleteMutation = useMutation({
    mutationFn: (/** @type {string} */ id) => base44.entities.NotificationSetting.delete(id),
    onSuccess: () => { toast.success('Rule deleted'); invalidateAll(); },
  });

  const markRead = async (n) => {
    await base44.entities.UserNotification.update(n.id, { read_at: new Date().toISOString() });
    qc.invalidateQueries({ queryKey: ['user-notifications'] });
    qc.invalidateQueries({ queryKey: ['user-notifications-unread'] });
  };

  // Throttle mark-all-read in batches of 8 concurrent updates. The previous
  // Promise.all over ALL unread rows opened up to 100 simultaneous PATCH
  // requests against the entity API, which is rude to the backend and on
  // slow connections caused the toast to fire before half the writes landed.
  const markAllRead = async () => {
    const unread = inbox.filter(n => !n.read_at);
    if (unread.length === 0) return;
    const now = new Date().toISOString();
    const BATCH = 8;
    for (let i = 0; i < unread.length; i += BATCH) {
      const slice = unread.slice(i, i + BATCH);
       
      await Promise.all(slice.map(n =>
        base44.entities.UserNotification.update(n.id, { read_at: now }).catch(() => null)
      ));
    }
    qc.invalidateQueries({ queryKey: ['user-notifications'] });
    qc.invalidateQueries({ queryKey: ['user-notifications-unread'] });
    toast.success(`Marked ${unread.length} as read`);
  };

  const handleClose = () => {
    setShowForm(false); setEditingRule(null);
    invalidateAll();
  };

  const handleEventClose = () => {
    setShowEventForm(false); setEditingEvent(null);
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
            Two kinds of rules: <strong>Change alerts</strong> fire when an already-accepted task changes (e.g.
            due date moved). <strong>New-task emails</strong> route incoming offers that need a human decision.
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
        {activeTab === 'events' && (
          <button
            onClick={() => { setEditingEvent(null); setShowEventForm(true); }}
            className="inline-flex items-center gap-2 h-9 px-4 rounded-md bg-accent text-white text-[13px] font-medium hover:bg-[var(--accent-hover)] transition-colors duration-tab"
          >
            <Plus className="w-4 h-4" /> New rule
          </button>
        )}
      </header>

      <div className="flex items-center gap-1 mb-6 border-b border-line-1 pb-3">
        {tabBtn('inbox', 'Inbox', Inbox, unreadCount)}
        {tabBtn('events', 'Change alerts', Bell)}
        {tabBtn('rules', 'New-task emails', SettingsIcon)}
        {tabBtn('deliveries', 'Email log', Send)}
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

      {activeTab === 'events' && (
        <>
          {showEventForm && (
            <div className="mb-6">
              <EventRuleForm rule={editingEvent} portals={portals} onClose={handleEventClose} />
            </div>
          )}
          <section>
            <p className="text-[12px] text-ink-3 italic-editorial mb-3">
              Rules below fire <strong>after</strong> a task is already accepted — e.g. when Symfonie moves a due
              date. Without any active rule, every change goes to the inbox and all admins get an email
              (legacy default).
            </p>
            {eventRulesLoading ? (
              <div className="space-y-2">{[1, 2].map((i) => <Skeleton key={i} className="h-16" />)}</div>
            ) : eventRules.length === 0 ? (
              <EmptyState
                title="No event rules yet"
                body="Create a rule to control who hears about due-date changes — by portal, by recipient, with a minimum-change threshold so small shifts don't spam your inbox."
                cta={() => <><Plus className="w-4 h-4" /> New rule</>}
                action={() => { setEditingEvent(null); setShowEventForm(true); }}
              />
            ) : (
              <div className="space-y-2">
                {eventRules.map((s) => (
                  <EventRuleRow
                    key={s.id}
                    setting={s}
                    portalLabel={portalLabel}
                    onToggle={() => settingToggleMutation.mutate({ id: s.id, data: { is_active: !s.is_active } })}
                    onEdit={() => { setEditingEvent(s); setShowEventForm(true); }}
                    onDelete={() => { if (confirm(`Delete "${s.name}"?`)) settingDeleteMutation.mutate(s.id); }}
                  />
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