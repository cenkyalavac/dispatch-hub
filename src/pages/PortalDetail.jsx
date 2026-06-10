import { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, ListChecks, ArrowLeftRight, Split, Settings, BarChart3, Webhook, Inbox } from 'lucide-react';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/ui/EmptyState';
import PortalDetailHeader from '@/components/portal-detail/PortalDetailHeader';
import PortalTabs from '@/components/portal-detail/PortalTabs';
import OverviewTab from '@/components/portal-detail/OverviewTab';
import RulesTab from '@/components/portal-detail/RulesTab';
import MappingsTab from '@/components/portal-detail/MappingsTab';
import RoutingTab from '@/components/portal-detail/RoutingTab';
import ActivityTab from '@/components/portal-detail/ActivityTab';
import PendingTab from '@/components/portal-detail/PendingTab';
import SettingsTab from '@/components/portal-detail/SettingsTab';
import WebhooksTab from '@/components/portal-detail/WebhooksTab';

// Per-connector workspace. Single source of truth for everything that scopes
// to one portal: status/secrets, rules, mappings, sheet routing, activity, settings.
export default function PortalDetail() {
  const { key } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  // Tab is URL-driven so TopBar's "Pending" dropdown can deep-link straight
  // into /portals/:key?tab=pending. We keep a local mirror to avoid re-reading
  // the query string on every render, and sync it both ways.
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') || 'overview';
  const [tab, setTab] = useState(initialTab);

  // External nav (e.g. clicking TopBar's Pending dropdown from another portal's
  // detail page) only changes the query string — keep local state in sync.
  useEffect(() => {
    const next = searchParams.get('tab') || 'overview';
    if (next !== tab) setTab(next);
     
  }, [searchParams]);

  const handleTabChange = (next) => {
    setTab(next);
    setSearchParams(next === 'overview' ? {} : { tab: next }, { replace: true });
  };

  const { data: portal, isLoading, error } = useQuery({
    queryKey: ['portal-detail', key],
    queryFn: async () => {
      const rows = await base44.entities.Portal.filter({ key });
      return rows[0] || null;
    },
  });

  const { data: ruleCount } = useQuery({
    queryKey: ['rules-by-portal-count', key],
    queryFn: async () => {
      const rules = await base44.entities.Rule.filter({ portal: key }, 'priority', 200);
      return rules.length;
    },
    enabled: !!portal,
  });

  const { data: mappingCount } = useQuery({
    queryKey: ['mappings-by-portal-count', key],
    queryFn: async () => {
      const [own, any] = await Promise.all([
        base44.entities.FieldMapping.filter({ portal: key }, '-created_date', 500),
        base44.entities.FieldMapping.filter({ portal: '*' }, '-created_date', 500),
      ]);
      return own.length + any.length;
    },
    enabled: !!portal,
  });

  const { data: routeCount } = useQuery({
    queryKey: ['routes-by-portal-count', key],
    queryFn: async () => {
      const routes = await base44.entities.SheetRoute.filter({ portal: key }, 'priority', 100);
      return routes.length;
    },
    enabled: !!portal,
  });

  // Flipping ON auto-runs the test function; failure flips back to OFF so the
  // UI never shows "active but broken". Flipping OFF is a pure persist.
  //
  // Important: cancelQueries before the optimistic patch so an in-flight
  // refetch can't stomp our optimistic state. We invalidate at the end to
  // sync against the authoritative server write.
  const handleToggle = async (next) => {
    await qc.cancelQueries({ queryKey: ['portal-detail', key] });
    qc.setQueryData(['portal-detail', key], (/** @type {any} */ old) => old ? { ...old, is_active: next } : old);

    const finalize = () => {
      qc.invalidateQueries({ queryKey: ['portal-detail', key] });
      qc.invalidateQueries({ queryKey: ['portals-all'] });
    };

    if (!next) {
      try {
        await base44.entities.Portal.update(portal.id, { is_active: false });
      } catch (err) {
        qc.setQueryData(['portal-detail', key], (/** @type {any} */ old) => old ? { ...old, is_active: true } : old);
        toast.error('Toggle failed: ' + err.message);
      } finally { finalize(); }
      return;
    }

    if (!portal.test_function) {
      try {
        await base44.entities.Portal.update(portal.id, { is_active: true });
        toast.warning(`${portal.name} enabled — no test function configured.`);
      } catch (err) {
        qc.setQueryData(['portal-detail', key], (/** @type {any} */ old) => old ? { ...old, is_active: false } : old);
        toast.error('Toggle failed: ' + err.message);
      } finally { finalize(); }
      return;
    }

    try {
      const res = await base44.functions.invoke(portal.test_function, {});
      const data = res.data || {};
      const success = !!data.success;
      const jwtDaysTail = (typeof data?.jwt?.expires_in_days === 'number') ? ` [jwt:${data.jwt.expires_in_days}]` : '';
      const baseMessage = success
        ? (data.whoami?.Login || data.jwt?.sub ? `Authenticated as ${data.whoami?.Login || data.jwt?.sub}` : 'Connection successful')
        : (data?.error || 'Connection failed');
      await base44.entities.Portal.update(portal.id, {
        is_active: success,
        connection_status: success ? 'connected' : 'error',
        connection_message: `${baseMessage}${jwtDaysTail}`,
        last_checked_at: new Date().toISOString(),
      });
      if (!success) {
        qc.setQueryData(['portal-detail', key], (/** @type {any} */ old) => old ? { ...old, is_active: false } : old);
      }
      if (success) toast.success(`${portal.name}: enabled & connected`);
      else toast.error(`${portal.name}: ${data?.error || 'test failed'} — disabled`);
    } catch (err) {
      const detail = err.response?.data?.error || err.response?.data?.message || err.message;
      qc.setQueryData(['portal-detail', key], (/** @type {any} */ old) => old ? { ...old, is_active: false } : old);
      try {
        await base44.entities.Portal.update(portal.id, {
          is_active: false,
          connection_status: 'error',
          connection_message: detail,
          last_checked_at: new Date().toISOString(),
        });
      } catch { /* swallow — best-effort persist */ }
      toast.error(`${portal.name}: ${detail} — disabled`);
    } finally {
      finalize();
    }
  };

  const tabs = useMemo(() => ([
    { key: 'overview', label: 'Overview',  icon: BarChart3 },
    { key: 'pending',  label: 'Pending',   icon: Inbox },
    { key: 'rules',    label: 'Rules',     icon: ListChecks,    count: ruleCount },
    { key: 'mappings', label: 'Mappings',  icon: ArrowLeftRight, count: mappingCount },
    { key: 'routing',  label: 'Routing',   icon: Split,         count: routeCount },
    { key: 'activity', label: 'Activity',  icon: Activity },
    { key: 'webhooks', label: 'Webhooks',  icon: Webhook },
    { key: 'settings', label: 'Settings',  icon: Settings },
  ]), [ruleCount, mappingCount, routeCount]);

  if (isLoading) {
    return (
      <div className="px-8 py-7 max-w-6xl">
        <Skeleton className="h-6 w-48 mb-4" />
        <Skeleton className="h-16 mb-4" />
        <Skeleton className="h-10 mb-6" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error || !portal) {
    return (
      <div className="px-8 py-7 max-w-6xl">
        <EmptyState
          title="Connector not found"
          body={`No connector with key "${key}".`}
          cta={() => 'Back to connectors'}
          action={() => navigate('/portals')}
        />
      </div>
    );
  }

  return (
    <div className="px-8 py-7 max-w-6xl">
      <PortalDetailHeader portal={portal} onToggleActive={handleToggle} />
      <PortalTabs tabs={tabs} active={tab} onChange={handleTabChange} />

      {tab === 'overview' && <OverviewTab portal={portal} />}
      {tab === 'pending'  && <PendingTab portal={portal} />}
      {tab === 'rules'    && <RulesTab portal={portal} />}
      {tab === 'mappings' && <MappingsTab portal={portal} />}
      {tab === 'routing'  && <RoutingTab portal={portal} />}
      {tab === 'activity' && <ActivityTab portal={portal} />}
      {tab === 'webhooks' && <WebhooksTab portal={portal} />}
      {tab === 'settings' && <SettingsTab portal={portal} onDeleted={() => navigate('/portals')} />}
    </div>
  );
}