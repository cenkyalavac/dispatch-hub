import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Plug, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import ConnectorCard from '@/components/connectors/ConnectorCard';
import ConnectorFormDialog from '@/components/connectors/ConnectorFormDialog';

// Known secrets — used to compute missing-secrets warnings on each card.
// Sourced from the in-app known list (developer comment / dashboard reality).
const KNOWN_SECRETS = new Set([
  'SYMFONIE_TENANT_ID',
  'SYMFONIE_SERVICE_ACCOUNT',
  'GOOGLE_SHEETS_SPREADSHEET_ID',
  'SYMFONIE_CLIENT_SECRET',
  'SYMFONIE_CLIENT_ID',
]);

export default function Connectors() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [testingKey, setTestingKey] = useState(null);
  const qc = useQueryClient();

  const { data: portals = [], isLoading } = useQuery({
    queryKey: ['portals-all'],
    queryFn: () => base44.entities.Portal.list(),
  });

  const saveMutation = useMutation({
    mutationFn: (data) =>
      editing?.id
        ? base44.entities.Portal.update(editing.id, data)
        : base44.entities.Portal.create(data),
    onSuccess: () => {
      toast.success(editing?.id ? 'Connector updated' : 'Connector added');
      qc.invalidateQueries({ queryKey: ['portals-all'] });
      qc.invalidateQueries({ queryKey: ['portals'] });
      qc.invalidateQueries({ queryKey: ['portals-sidebar'] });
      setDialogOpen(false);
      setEditing(null);
    },
    onError: (err) => toast.error('Error: ' + err.message),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }) => base44.entities.Portal.update(id, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portals-all'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Portal.delete(id),
    onSuccess: () => {
      toast.success('Connector removed');
      qc.invalidateQueries({ queryKey: ['portals-all'] });
    },
  });

  const handleTest = async (portal) => {
    if (!portal.test_function) {
      toast.error('No test function configured for this connector.');
      return;
    }
    setTestingKey(portal.key);
    try {
      const res = await base44.functions.invoke(portal.test_function, {});
      const data = res.data;
      const success = !!data?.success;
      await base44.entities.Portal.update(portal.id, {
        connection_status: success ? 'connected' : 'error',
        connection_message: success
          ? (data.whoami?.Login || data.jwt?.sub ? `Authenticated as ${data.whoami?.Login || data.jwt?.sub}` : 'Connection successful')
          : (data?.error || 'Connection failed'),
        last_checked_at: new Date().toISOString(),
      });
      qc.invalidateQueries({ queryKey: ['portals-all'] });
      if (success) toast.success(`${portal.name}: connected`);
      else toast.error(`${portal.name}: ${data?.error || 'failed'}`);
    } catch (err) {
      await base44.entities.Portal.update(portal.id, {
        connection_status: 'error',
        connection_message: err.message,
        last_checked_at: new Date().toISOString(),
      });
      qc.invalidateQueries({ queryKey: ['portals-all'] });
      toast.error('Test failed: ' + err.message);
    } finally {
      setTestingKey(null);
    }
  };

  const handleEdit = (portal) => { setEditing(portal); setDialogOpen(true); };
  const handleNew = () => { setEditing(null); setDialogOpen(true); };
  const handleDelete = (portal) => {
    if (confirm(`Remove "${portal.name}"? This won't delete past tasks.`)) {
      deleteMutation.mutate(portal.id);
    }
  };

  const computeMissing = (portal) => (portal.required_secrets || []).filter(s => !KNOWN_SECRETS.has(s));

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-accent text-accent-foreground text-xs font-medium mb-2">
            <Plug className="w-3 h-3" />
            Integration Hub
          </div>
          <h1 className="text-2xl font-bold text-foreground">Connectors</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage translation portal integrations and verify their connections.</p>
        </div>
        <Button onClick={handleNew} className="gap-2">
          <Plus className="w-4 h-4" /> Add Connector
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map(i => <div key={i} className="h-56 bg-secondary rounded-xl animate-pulse" />)}
        </div>
      ) : portals.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center text-muted-foreground">
            <Plug className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No connectors yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {portals.map(p => (
            <ConnectorCard
              key={p.id}
              portal={p}
              testing={testingKey === p.key}
              missingSecrets={computeMissing(p)}
              onTest={handleTest}
              onToggle={(portal, v) => toggleMutation.mutate({ id: portal.id, is_active: v })}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      <ConnectorFormDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditing(null); }}
        onSave={(data) => saveMutation.mutate(data)}
        initial={editing}
        isPending={saveMutation.isPending}
      />
    </div>
  );
}