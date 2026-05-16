import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plug } from 'lucide-react';

// Compact table that lets you assign each Portal to a Client. Inline edit only —
// changing the dropdown immediately persists. Designed for the Clients page.
export default function PortalClientMapping({ portals, clients }) {
  const qc = useQueryClient();
  const activeClients = clients.filter(c => c.is_active);

  const setClient = async (portal, clientId) => {
    try {
      await base44.entities.Portal.update(portal.id, { client_id: clientId || null });
      qc.invalidateQueries({ queryKey: ['portals-all'] });
      toast.success(`${portal.name} mapped`);
    } catch (err) {
      toast.error(err.message);
    }
  };

  if (portals.length === 0) {
    return (
      <div className="bg-surface-1 border border-dashed border-line-2 rounded-md px-6 py-8 text-center">
        <p className="text-[13px] text-ink-3 italic-editorial">No connectors yet. Add one from Connectors first.</p>
      </div>
    );
  }

  return (
    <div className="bg-surface-1 border border-line-1 rounded-md overflow-hidden">
      <div className="px-4 py-3 border-b border-line-1 flex items-center gap-2">
        <Plug className="w-3.5 h-3.5 text-ink-3" />
        <h3 className="text-[13px] font-semibold text-ink-1">Connectors → Clients</h3>
      </div>
      <ul>
        {portals.map((p) => (
          <li key={p.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-line-1 last:border-b-0">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-ink-1 truncate">{p.name}</p>
              <p className="text-[11px] font-mono text-ink-3 truncate">{p.key}</p>
            </div>
            <select
              value={p.client_id || ''}
              onChange={(e) => setClient(p, e.target.value)}
              className="h-8 px-2 rounded-md border border-line-1 bg-surface-1 text-[12px] outline-none min-w-[180px]"
            >
              <option value="">— Unassigned —</option>
              {activeClients.map((c) => (
                <option key={c.id} value={c.id}>{c.display_name}</option>
              ))}
            </select>
          </li>
        ))}
      </ul>
    </div>
  );
}