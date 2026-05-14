import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
// useMutation is still used for save/delete mutations below — toggle now uses
// a plain async function so its ordering against the test call is deterministic.
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
  'SYMFONIE_CLIENT_SECRET',
  'SYMFONIE_CLIENT_ID',
  'JUNCTION_JWT',
  'JUNCTION_API_KEY',
  'GLOBALLINK_JWT',
  'GLOBALLINK_CONTEXT_USER',
  'GLOBALLINK_BASE_URL',
]);

// Optional secrets — present in required_secrets for documentation but never block usage.
const OPTIONAL_SECRETS = new Set();

export default function Connectors() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [testingKey, setTestingKey] = useState(null);
  const qc = useQueryClient();

  const { data: portals = [], isLoading } = useQuery({
    queryKey: ['portals-all'],
    // Sort by name so the grid order is deterministic across renders / refetches.
    queryFn: () => base44.entities.Portal.list('name'),
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

  // Optimistic helper — flip a portal's UI state instantly without an awaited mutation.
  // We then perform the actual persist (and any follow-up test) in handleToggle.
  // Doing this with useMutation introduced a race against the awaited test/update
  // calls below; a plain function call gives us deterministic ordering.
  const optimisticPatch = (id, patch) => {
    qc.setQueryData(['portals-all'], (old) =>
      (old || []).map((p) => (p.id === id ? { ...p, ...patch } : p))
    );
  };
  const invalidatePortals = () => {
    qc.invalidateQueries({ queryKey: ['portals-all'] });
    qc.invalidateQueries({ queryKey: ['portals'] });
    qc.invalidateQueries({ queryKey: ['portals-sidebar'] });
  };

  // When the user flips a portal ON, immediately verify the connection.
  // If the test fails, flip it back OFF so the UI never claims "active but broken".
  // Turning OFF is a pure persist — no test required.
  const handleToggle = async (portal, nextActive) => {
    // OFF → persist, no test, done.
    if (!nextActive) {
      optimisticPatch(portal.id, { is_active: false });
      try {
        await base44.entities.Portal.update(portal.id, { is_active: false });
      } catch (err) {
        optimisticPatch(portal.id, { is_active: true });
        toast.error('Toggle failed: ' + err.message);
      } finally {
        invalidatePortals();
      }
      return;
    }

    // ON → optimistic flip, then test.
    optimisticPatch(portal.id, { is_active: true });

    if (!portal.test_function) {
      try {
        await base44.entities.Portal.update(portal.id, { is_active: true });
        toast.warning(`${portal.name} enabled — no test function configured.`);
      } catch (err) {
        optimisticPatch(portal.id, { is_active: false });
        toast.error('Toggle failed: ' + err.message);
      } finally {
        invalidatePortals();
      }
      return;
    }

    setTestingKey(portal.key);
    try {
      const res = await base44.functions.invoke(portal.test_function, {});
      const data = res.data || {};
      const success = !!data.success;
      const jwtDaysTail = (typeof data?.jwt?.expires_in_days === 'number') ? ` [jwt:${data.jwt.expires_in_days}]` : '';
      const baseMessage = success
        ? (data.whoami?.Login || data.jwt?.sub ? `Authenticated as ${data.whoami?.Login || data.jwt?.sub}` : 'Connection successful')
        : (data?.error || 'Connection failed');

      // Single authoritative write — combines toggle + status in one update.
      await base44.entities.Portal.update(portal.id, {
        is_active: success,
        connection_status: success ? 'connected' : 'error',
        connection_message: `${baseMessage}${jwtDaysTail}`,
        last_checked_at: new Date().toISOString(),
      });
      if (!success) optimisticPatch(portal.id, { is_active: false });
      if (success) toast.success(`${portal.name}: enabled & connected`);
      else toast.error(`${portal.name}: ${data?.error || 'test failed'} — disabled`);
    } catch (err) {
      const detail = err.response?.data?.error || err.response?.data?.message || err.message;
      optimisticPatch(portal.id, { is_active: false });
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
      setTestingKey(null);
      invalidatePortals();
    }
  };

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

    // Persist test result back to the Portal — but never let a write failure mask
    // the actual test outcome. Wrapped in its own try so the user always sees the truth.
    const persist = async (patch) => {
      try {
        await base44.entities.Portal.update(portal.id, patch);
        qc.invalidateQueries({ queryKey: ['portals-all'] });
      } catch (e) {
        console.warn('Portal status persist failed:', e.message);
      }
    };

    try {
      const res = await base44.functions.invoke(portal.test_function, {});
      const data = res.data;
      const success = !!data?.success;
      // For JWT-auth connectors (Junction), surface remaining JWT lifetime as a [jwt:N] tail
      // — the ConnectorCard strips it back out before display and renders a JwtExpiryBadge.
      const jwtDaysTail = (typeof data?.jwt?.expires_in_days === 'number')
        ? ` [jwt:${data.jwt.expires_in_days}]`
        : '';
      const baseMessage = success
        ? (data.whoami?.Login || data.jwt?.sub ? `Authenticated as ${data.whoami?.Login || data.jwt?.sub}` : 'Connection successful')
        : (data?.error || 'Connection failed');
      await persist({
        connection_status: success ? 'connected' : 'error',
        connection_message: `${baseMessage}${jwtDaysTail}`,
        last_checked_at: new Date().toISOString(),
      });
      if (success) toast.success(`${portal.name}: connected`);
      else toast.error(`${portal.name}: ${data?.error || 'failed'}`);
    } catch (err) {
      // Surface the real HTTP body when axios swallows it behind a generic 500.
      const detail = err.response?.data?.error || err.response?.data?.message || err.message;
      await persist({
        connection_status: 'error',
        connection_message: detail,
        last_checked_at: new Date().toISOString(),
      });
      toast.error('Test failed: ' + detail);
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

  const computeMissing = (portal) =>
    (portal.required_secrets || []).filter(s => !KNOWN_SECRETS.has(s) && !OPTIONAL_SECRETS.has(s));

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
              onToggle={handleToggle}
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