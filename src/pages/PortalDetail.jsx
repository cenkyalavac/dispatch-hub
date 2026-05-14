import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Activity, ListChecks, ArrowLeftRight, Split, Settings, BarChart3 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/ui/EmptyState';
import PortalDetailHeader from '@/components/portal-detail/PortalDetailHeader';
import PortalTabs from '@/components/portal-detail/PortalTabs';
import OverviewTab from '@/components/portal-detail/OverviewTab';
import RulesTab from '@/components/portal-detail/RulesTab';
import MappingsTab from '@/components/portal-detail/MappingsTab';
import RoutingTab from '@/components/portal-detail/RoutingTab';
import ActivityTab from '@/components/portal-detail/ActivityTab';
import SettingsTab from '@/components/portal-detail/SettingsTab';

// Per-connector workspace. Single source of truth for everything that scopes
// to one portal: status/secrets, rules, mappings, sheet routing, activity, settings.
export default function PortalDetail() {
  const { key } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState('overview');

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

  const toggleActive = useMutation({
    mutationFn: (next) => base44.entities.Portal.update(portal.id, { is_active: next }),
    onMutate: async (next) => {
      await qc.cancelQueries({ queryKey: ['portal-detail', key] });
      const prev = qc.getQueryData(['portal-detail', key]);
      qc.setQueryData(['portal-detail', key], (old) => old ? { ...old, is_active: next } : old);
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(['portal-detail', key], ctx.prev); },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['portal-detail', key] });
      qc.invalidateQueries({ queryKey: ['portals-all'] });
    },
  });

  const tabs = useMemo(() => ([
    { key: 'overview', label: 'Overview',  icon: BarChart3 },
    { key: 'rules',    label: 'Rules',     icon: ListChecks,    count: ruleCount },
    { key: 'mappings', label: 'Mappings',  icon: ArrowLeftRight, count: mappingCount },
    { key: 'routing',  label: 'Routing',   icon: Split,         count: routeCount },
    { key: 'activity', label: 'Activity',  icon: Activity },
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
      <PortalDetailHeader portal={portal} onToggleActive={(v) => toggleActive.mutate(v)} />
      <PortalTabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'overview' && <OverviewTab portal={portal} />}
      {tab === 'rules'    && <RulesTab portal={portal} />}
      {tab === 'mappings' && <MappingsTab portal={portal} />}
      {tab === 'routing'  && <RoutingTab portal={portal} />}
      {tab === 'activity' && <ActivityTab portal={portal} />}
      {tab === 'settings' && <SettingsTab portal={portal} onDeleted={() => navigate('/portals')} />}
    </div>
  );
}