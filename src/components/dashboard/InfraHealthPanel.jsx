import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { CheckCircle2, XCircle, PauseCircle, PlugZap } from 'lucide-react';

// Infrastructure health at a glance — the plumbing every accept path needs:
//   1. App connectors (Google Sheets, Dropbox) — file/sheet write capability.
//   2. Paused portals — connectors toggled off, so no tasks flow in.
//
// This panel exists because a 12-day Google Sheets outage went unnoticed:
// nothing on the dashboard showed connector state. Now a red row here makes
// it obvious the moment a connector drops.

function StatusRow({ icon: Icon, iconCls, label, detail, detailCls }) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2">
      <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${iconCls}`} />
      <span className="text-[13px] text-ink-1 font-medium">{label}</span>
      <span className={`ml-auto text-[11px] ${detailCls}`}>{detail}</span>
    </div>
  );
}

export default function InfraHealthPanel({ portals = [] }) {
  const { data: health, isLoading } = useQuery({
    queryKey: ['connector-health'],
    queryFn: async () => {
      const res = await base44.functions.invoke('connectorHealth', {});
      return res.data;
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const connectors = health?.connectors || [];
  const pausedPortals = portals.filter((p) => p.is_active === false);
  const anyConnectorDown = connectors.some((c) => !c.connected);

  return (
    <section className="bg-surface-1 border border-line-1 rounded-md p-5">
      <div className="flex items-center gap-2 mb-3">
        <PlugZap className="w-3.5 h-3.5 text-ink-3" />
        <h2 className="text-[14px] font-semibold text-ink-1">Infrastructure</h2>
        {anyConnectorDown && (
          <span className="ml-auto text-[10px] font-semibold uppercase tracking-wider text-danger bg-danger-soft px-1.5 py-0.5 rounded">
            Action needed
          </span>
        )}
      </div>

      <div className="border border-line-1 rounded-md divide-y divide-line-1">
        {isLoading ? (
          <div className="px-3 py-2 text-[12px] text-ink-3 italic-editorial">Checking connectors…</div>
        ) : (
          connectors.map((c) => (
            <StatusRow
              key={c.key}
              icon={c.connected ? CheckCircle2 : XCircle}
              iconCls={c.connected ? 'text-success' : 'text-danger'}
              label={c.label}
              detail={c.connected ? 'Connected' : 'Not connected'}
              detailCls={c.connected ? 'text-ink-3' : 'text-danger font-medium'}
            />
          ))
        )}

        {pausedPortals.map((p) => (
          <StatusRow
            key={p.key}
            icon={PauseCircle}
            iconCls="text-warning"
            label={p.name}
            detail="Paused"
            detailCls="text-warning font-medium"
          />
        ))}
      </div>

      {!isLoading && !anyConnectorDown && pausedPortals.length === 0 && (
        <p className="mt-2 text-[11px] text-ink-3 italic-editorial">
          All connectors live, every portal active.
        </p>
      )}
    </section>
  );
}