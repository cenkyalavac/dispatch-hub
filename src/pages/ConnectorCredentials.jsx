import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/ui/EmptyState';
import CredentialCard from '@/components/credentials/CredentialCard';

// Statuses that mean "the broker is mid-handshake" — while any card is in one
// of these we poll every 4s so the admin watches the login progress live.
const IN_PROGRESS = new Set(['requested', 'logging_in', 'awaiting_sms']);

const CONNECTOR_LABELS = {
  globallink: 'GlobalLink',
  worldserver: 'WorldServer',
  welocalize: 'Welocalize',
};

export default function ConnectorCredentials() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const { data: creds = [], isLoading, refetch } = useQuery({
    queryKey: ['connector-credentials'],
    queryFn: () => base44.entities.ConnectorCredential.list('connector', 200),
    enabled: isAdmin,
    refetchInterval: (query) => {
      const rows = query.state.data || [];
      const active = rows.some(
        (c) => IN_PROGRESS.has(c.sessionStatus) || IN_PROGRESS.has(c.reauthState)
      );
      return active ? 4000 : false;
    },
  });

  const groups = useMemo(() => {
    const by = {};
    for (const c of creds) {
      const key = c.connector || 'other';
      (by[key] ||= []).push(c);
    }
    return Object.entries(by).sort(([a], [b]) => a.localeCompare(b));
  }, [creds]);

  if (!isAdmin) {
    return (
      <div className="px-8 py-7 max-w-3xl">
        <div className="bg-surface-1 border border-line-1 rounded-md px-8 py-12 text-center">
          <ShieldAlert className="w-6 h-6 text-ink-3 mx-auto mb-3" />
          <h1 className="text-[16px] font-semibold text-ink-1">Admins only</h1>
          <p className="text-[13px] text-ink-3 italic-editorial mt-1">
            Connector credentials are restricted to administrators.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-8 py-7 max-w-5xl">
      <header className="mb-6">
        <h1 className="text-[22px] font-semibold tracking-tight text-ink-1">Connector Credentials</h1>
        <p className="text-[13px] text-ink-3 mt-1 italic-editorial">
          Manage broker logins and complete re-authentication — including MFA — without the command line.
          An external broker reads these entries and performs the real login.
        </p>
      </header>

      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-56" />)}
        </div>
      ) : creds.length === 0 ? (
        <EmptyState
          title="No broker accounts yet"
          body="Credential rows are provisioned per broker account. Once added, they'll appear here grouped by connector."
        />
      ) : (
        <div className="space-y-8">
          {groups.map(([connector, rows]) => (
            <section key={connector}>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-[13px] font-semibold uppercase tracking-wider text-ink-2">
                  {CONNECTOR_LABELS[connector] || connector}
                </h2>
                <span className="text-[11px] text-ink-3 font-mono">{rows.length}</span>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {rows.map((c) => (
                  <CredentialCard key={c.id} cred={c} onChanged={() => refetch()} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}