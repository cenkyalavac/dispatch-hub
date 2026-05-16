import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { Pencil, Trash2, Plug } from 'lucide-react';
import { toast } from 'sonner';

// One row of the Clients list. Shows display name, slug, # of portals mapped
// to this client, and quick actions (edit / delete).
export default function ClientRow({ client, portalCount, onEdit }) {
  const qc = useQueryClient();

  const remove = async () => {
    if (portalCount > 0) {
      toast.error(`Unassign ${portalCount} portal${portalCount > 1 ? 's' : ''} first`);
      return;
    }
    if (!confirm(`Delete "${client.display_name}"?`)) return;
    try {
      await base44.entities.Client.delete(client.id);
      qc.invalidateQueries({ queryKey: ['clients'] });
      toast.success('Client deleted');
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <li className="flex items-center gap-3 px-4 py-3 hover-surface">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-[13px] font-medium text-ink-1 truncate">{client.display_name}</p>
          {!client.is_active && (
            <span className="text-[10px] uppercase tracking-wider text-ink-3 bg-surface-2 px-1.5 py-0.5 rounded">Inactive</span>
          )}
        </div>
        <p className="text-[11px] font-mono text-ink-3 truncate">{client.slug}</p>
      </div>

      <div className="inline-flex items-center gap-1.5 text-[11px] text-ink-3 whitespace-nowrap">
        <Plug className="w-3 h-3" />
        {portalCount} portal{portalCount === 1 ? '' : 's'}
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={() => onEdit(client)}
          className="inline-flex items-center justify-center h-7 w-7 rounded text-ink-3 hover:bg-surface-2 transition-colors duration-tab"
          title="Edit"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={remove}
          className="inline-flex items-center justify-center h-7 w-7 rounded text-ink-3 hover:bg-surface-2 hover:text-danger transition-colors duration-tab"
          title="Delete"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </li>
  );
}