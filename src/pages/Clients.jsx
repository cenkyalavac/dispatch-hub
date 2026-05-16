import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Plus, Users } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/ui/EmptyState';
import ClientForm from '@/components/clients/ClientForm';
import ClientRow from '@/components/clients/ClientRow';

// Clients = the translation agency's own end-customers. Portal→Client mapping
// itself happens on the Connector form (required field there) — this page just
// owns the master list of clients and surfaces how many connectors each one
// currently powers.
export default function Clients() {
  const [editing, setEditing] = useState(null);  // client object or {} for new

  const { data: clients = [], isLoading: loadingClients } = useQuery({
    queryKey: ['clients'],
    queryFn: () => base44.entities.Client.list('-created_date'),
  });

  const { data: portals = [], isLoading: loadingPortals } = useQuery({
    queryKey: ['portals-all'],
    queryFn: () => base44.entities.Portal.list(),
  });

  const portalCountByClient = portals.reduce((acc, p) => {
    if (p.client_id) acc[p.client_id] = (acc[p.client_id] || 0) + 1;
    return acc;
  }, {});

  const slugs = clients.map(c => c.slug);

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-ink-3" />
            <h1 className="text-[20px] font-semibold tracking-tight text-ink-1">Clients</h1>
          </div>
          <p className="text-[13px] text-ink-3 italic-editorial mt-1">
            Your agency's end-customers. Map each connector to a client so accepted tasks carry the right attribution.
          </p>
        </div>
        {!editing && (
          <button
            onClick={() => setEditing({})}
            className="inline-flex items-center gap-2 h-9 px-4 rounded-md bg-accent text-white text-[13px] font-medium hover:bg-[var(--accent-hover)] transition-colors duration-tab"
          >
            <Plus className="w-3.5 h-3.5" /> New client
          </button>
        )}
      </div>

      {editing && (
        <div className="mb-6">
          <ClientForm
            client={editing.id ? editing : null}
            existingSlugs={slugs}
            onClose={() => setEditing(null)}
          />
        </div>
      )}

      {/* Clients list */}
      <section className="mb-8">
        {loadingClients || loadingPortals ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-14" />)}
          </div>
        ) : clients.length === 0 ? (
          <EmptyState
            title="No clients yet"
            body="Add your first client, then assign it from the connector form."
            cta={() => (<><Plus className="w-3.5 h-3.5" /> New client</>)}
            action={() => setEditing({})}
          />
        ) : (
          <div className="bg-surface-1 border border-line-1 rounded-md overflow-hidden">
            <ul className="divide-y divide-line-1">
              {clients.map((c) => (
                <ClientRow
                  key={c.id}
                  client={c}
                  portalCount={portalCountByClient[c.id] || 0}
                  onEdit={setEditing}
                />
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}