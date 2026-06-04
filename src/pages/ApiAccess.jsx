import { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, Webhook, KeyRound, BookOpen, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

import ApiKeyCard from '@/components/api/ApiKeyCard';
import WebhookRow from '@/components/api/WebhookRow';
import NewKeyDialog from '@/components/api/NewKeyDialog';
import EmptyState from '@/components/ui/EmptyState';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { Skeleton } from '@/components/ui/skeleton';

export default function ApiAccess() {
  const qc = useQueryClient();
  const [newKeyName, setNewKeyName] = useState('');
  const [newToken, setNewToken] = useState(null);
  const [hookForm, setHookForm] = useState({ name: '', url: '', secret: '', tenant_id: 'default' });
  // Single state slot for confirm dialogs (key revoke + webhook delete). Holds
  // { title, body, confirmLabel, danger, onConfirm } or null when closed.
  const [confirmState, setConfirmState] = useState(null);

  const { data: keys = [], isLoading: keysLoading } = useQuery({
    queryKey: ['api-keys'],
    queryFn: () => base44.entities.ApiKey.list('-created_date'),
  });
  const { data: hooks = [], isLoading: hooksLoading } = useQuery({
    queryKey: ['webhook-subs'],
    queryFn: () => base44.entities.WebhookSubscription.list('-created_date'),
  });
  // Pull a healthier window — the health indicator looks at the last 10 deliveries PER subscription.
  const { data: deliveries = [] } = useQuery({
    queryKey: ['webhook-deliveries'],
    queryFn: () => base44.entities.WebhookDelivery.list('-created_date', 200),
    refetchInterval: 30_000,
  });
  const { data: projects = [] } = useQuery({
    queryKey: ['projects-summary'],
    queryFn: () => base44.entities.Project.list('-created_date', 500),
  });

  const stateCounts = useMemo(() => {
    const c = { accepted: 0, synchronized: 0, delivered: 0, failed_to_sync: 0 };
    for (const p of projects) c[p.state] = (c[p.state] || 0) + 1;
    return c;
  }, [projects]);

  const createKey = async (e) => {
    e.preventDefault();
    if (!newKeyName.trim()) { toast.error('Name is required'); return; }
    try {
      const res = await base44.functions.invoke('createApiKey', { name: newKeyName.trim() });
      if (res.data?.success) {
        setNewToken(res.data.token);
        setNewKeyName('');
        qc.invalidateQueries({ queryKey: ['api-keys'] });
      } else toast.error(res.data?.error || 'Create failed');
    } catch (err) { toast.error(err.message); }
  };

  const revokeKey = (key) => {
    setConfirmState({
      title: `Revoke "${key.name}"?`,
      body: 'This cannot be undone. Any BMS using this key will start receiving 401 responses immediately.',
      confirmLabel: 'Revoke key',
      danger: true,
      onConfirm: async () => {
        await base44.entities.ApiKey.update(key.id, { revoked_at: new Date().toISOString() });
        qc.invalidateQueries({ queryKey: ['api-keys'] });
        toast.success('Key revoked');
      },
    });
  };

  const createHook = async (e) => {
    e.preventDefault();
    if (!hookForm.url.trim()) { toast.error('URL is required'); return; }
    await base44.entities.WebhookSubscription.create({
      name: hookForm.name.trim() || 'Webhook',
      url: hookForm.url.trim(),
      secret: hookForm.secret.trim() || undefined,
      tenant_id: hookForm.tenant_id.trim() || 'default',
      events: ['project.accepted', 'project.synchronized', 'project.delivered'],
      is_active: true,
    });
    setHookForm({ name: '', url: '', secret: '', tenant_id: 'default' });
    qc.invalidateQueries({ queryKey: ['webhook-subs'] });
    toast.success('Webhook added');
  };

  const toggleHook = async (sub) => {
    await base44.entities.WebhookSubscription.update(sub.id, { is_active: !sub.is_active });
    qc.invalidateQueries({ queryKey: ['webhook-subs'] });
  };

  const deleteHook = (sub) => {
    setConfirmState({
      title: `Delete webhook "${sub.name || sub.url}"?`,
      body: 'The subscriber will stop receiving project.* events. Past delivery logs are preserved.',
      confirmLabel: 'Delete webhook',
      danger: true,
      onConfirm: async () => {
        await base44.entities.WebhookSubscription.delete(sub.id);
        qc.invalidateQueries({ queryKey: ['webhook-subs'] });
        toast.success('Webhook deleted');
      },
    });
  };

  const input = 'w-full h-9 px-3 rounded-md border border-line-1 bg-surface-1 text-[13px] outline-none placeholder:text-ink-4';

  return (
    <div className="px-8 py-7 max-w-5xl">
      <header className="mb-7">
        <h1 className="text-[22px] font-semibold tracking-tight text-ink-1">API Access</h1>
        <p className="text-[13px] text-ink-3 mt-1 italic-editorial">
          Tokens, webhooks, and a live ledger of every project the BMS has seen.
        </p>
      </header>

      {/* Project state ledger */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-7">
        {[
          ['Accepted',       stateCounts.accepted,       'awaiting BMS pull'],
          ['Synchronized',   stateCounts.synchronized,   'pulled by BMS'],
          ['Delivered',      stateCounts.delivered,      'completed'],
          ['Failed to sync', stateCounts.failed_to_sync, 'needs attention'],
        ].map(([k, v, sub]) => (
          <div key={k} className="bg-surface-1 border border-line-1 rounded-md p-3.5">
            <p className="text-[10px] uppercase tracking-wider text-ink-3">{k}</p>
            <p className="text-[22px] font-semibold tabular-nums mt-0.5 text-ink-1">{v}</p>
            <p className="text-[11px] text-ink-3 italic-editorial mt-0.5">{sub}</p>
          </div>
        ))}
      </section>

      {/* Pointer to the dedicated Documentation page — the full endpoint
          reference, webhook event catalog, signature verification, and retry
          model used to live inline on this page. They've moved so this page
          stays operational (keys, hooks, deliveries) and the reference stays
          stable. */}
      <Link
        to="/api/docs"
        className="group block bg-surface-1 border border-line-1 rounded-md p-4 mb-6 hover:bg-surface-2 transition-colors duration-tab"
      >
        <div className="flex items-center gap-3">
          <span className="w-8 h-8 rounded-md bg-accent-soft text-accent-ink flex items-center justify-center shrink-0">
            <BookOpen className="w-4 h-4" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-ink-1">API Documentation</p>
            <p className="text-[12px] text-ink-3 italic-editorial">
              Endpoints, webhook events, signature verification, retries — the full reference.
            </p>
          </div>
          <ArrowRight className="w-4 h-4 text-ink-3 group-hover:text-ink-1 group-hover:translate-x-0.5 transition-all duration-tab" />
        </div>
      </Link>

      {/* API keys */}
      <section className="bg-surface-1 border border-line-1 rounded-md p-5 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <KeyRound className="w-4 h-4 text-ink-3" />
          <h2 className="text-[14px] font-semibold text-ink-1">API keys</h2>
        </div>

        <form onSubmit={createKey} className="flex gap-2 mb-4">
          <input
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder="Key name (e.g. Dispatch production)"
            className={`${input} flex-1`}
          />
          <button type="submit" className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-accent text-white text-[13px] font-medium hover:bg-[var(--accent-hover)] transition-colors duration-tab">
            <Plus className="w-3.5 h-3.5" /> Create
          </button>
        </form>

        {keysLoading ? (
          <div className="space-y-2">{[1, 2].map(i => <Skeleton key={i} className="h-16" />)}</div>
        ) : keys.length === 0 ? (
          <EmptyState title="No API keys yet" body="Create the first key to let a BMS pull projects." />
        ) : (
          <div className="space-y-2">
            {keys.map(k => <ApiKeyCard key={k.id} apiKey={k} onRevoke={revokeKey} />)}
          </div>
        )}
      </section>

      {/* Webhooks */}
      <section className="bg-surface-1 border border-line-1 rounded-md p-5 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Webhook className="w-4 h-4 text-ink-3" />
          <h2 className="text-[14px] font-semibold text-ink-1">Webhooks</h2>
        </div>

        <form onSubmit={createHook} className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-4">
          <input
            value={hookForm.name}
            onChange={(e) => setHookForm({ ...hookForm, name: e.target.value })}
            placeholder="Label"
            className={input}
          />
          <input
            value={hookForm.url}
            onChange={(e) => setHookForm({ ...hookForm, url: e.target.value })}
            placeholder="https://bms.example/hook"
            className={`${input} md:col-span-2`}
          />
          <input
            value={hookForm.secret}
            onChange={(e) => setHookForm({ ...hookForm, secret: e.target.value })}
            placeholder="Signing secret (optional)"
            className={input}
          />
          <button type="submit" className="md:col-span-4 inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-md bg-accent text-white text-[13px] font-medium hover:bg-[var(--accent-hover)] transition-colors duration-tab">
            <Plus className="w-3.5 h-3.5" /> Add webhook
          </button>
        </form>

        {hooksLoading ? (
          <div className="space-y-2">{[1, 2].map(i => <Skeleton key={i} className="h-16" />)}</div>
        ) : hooks.length === 0 ? (
          <EmptyState title="No webhooks yet" body="Add a URL to receive project.* events." />
        ) : (
          <div className="space-y-2">
            {hooks.map(h => (
              <WebhookRow
                key={h.id}
                sub={h}
                deliveries={deliveries}
                onToggle={toggleHook}
                onDelete={deleteHook}
              />
            ))}
          </div>
        )}
      </section>

      {/* Deliveries log */}
      {deliveries.length > 0 && (
        <section className="bg-surface-1 border border-line-1 rounded-md">
          <header className="px-5 py-3 border-b border-line-1">
            <h2 className="text-[14px] font-semibold text-ink-1">Recent deliveries</h2>
          </header>
          <div className="divide-y divide-line-1 max-h-96 overflow-y-auto">
            {deliveries.slice(0, 30).map(d => {
              const tone =
                d.status === 'success' ? 'bg-success' :
                d.status === 'retry_scheduled' ? 'bg-warning' :
                d.status === 'failed' ? 'bg-danger' :
                'bg-ink-4';
              return (
                <div key={d.id} className="px-5 py-2.5 flex items-center gap-3 text-[12px]">
                  <span className={`w-1.5 h-1.5 rounded-full ${tone}`} title={d.status} />
                  <span className="font-mono text-ink-2">{d.event}</span>
                  <span className="font-mono text-ink-3 truncate flex-1">{d.url}</span>
                  {d.attempt > 1 && <span className="text-[10px] uppercase tracking-wider text-ink-3">try {d.attempt}</span>}
                  <span className="text-ink-3 tabular-nums">{d.http_status || (d.error ? 'err' : '—')}</span>
                  <span className="text-ink-3 italic-editorial">
                    {d.delivered_at ? formatDistanceToNow(new Date(d.delivered_at), { addSuffix: true }) : '—'}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {newToken && <NewKeyDialog token={newToken} onClose={() => setNewToken(null)} />}
      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
    </div>
  );
}