import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { Play, Loader2, ExternalLink, Key, Clock, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import JwtExpiryBadge from '@/components/connectors/JwtExpiryBadge';

// Read-only-ish overview: status, secrets, last sync/check, test button.
// Edit lives in the Settings tab.

const KNOWN_SECRETS = new Set([
  'SYMFONIE_TENANT_ID', 'SYMFONIE_SERVICE_ACCOUNT', 'SYMFONIE_CLIENT_SECRET', 'SYMFONIE_CLIENT_ID',
  'JUNCTION_JWT', 'JUNCTION_API_KEY',
  'GLOBALLINK_JWT', 'GLOBALLINK_CONTEXT_USER', 'GLOBALLINK_BASE_URL',
  'BROKER_URL', 'BROKER_KEY', 'GOOGLE_SHEETS_SPREADSHEET_ID',
]);

function parseJwtDays(message) {
  if (!message) return null;
  const m = message.match(/\[jwt:(-?\d+)\]/);
  return m ? Number(m[1]) : null;
}

export default function OverviewTab({ portal }) {
  const qc = useQueryClient();
  const [testing, setTesting] = useState(false);

  const missingSecrets = (portal.required_secrets || []).filter((s) => !KNOWN_SECRETS.has(s));
  const jwtDays = parseJwtDays(portal.connection_message);
  const cleanMessage = portal.connection_message?.replace(/\s*\[jwt:-?\d+\]\s*$/, '').trim();

  const handleTest = async () => {
    if (!portal.test_function) { toast.error('No test function configured.'); return; }
    setTesting(true);
    try {
      const res = await base44.functions.invoke(portal.test_function, {});
      const data = res.data || {};
      const success = !!data.success;
      const jwtDaysTail = (typeof data?.jwt?.expires_in_days === 'number') ? ` [jwt:${data.jwt.expires_in_days}]` : '';
      const baseMessage = success
        ? (data.whoami?.Login || data.jwt?.sub ? `Authenticated as ${data.whoami?.Login || data.jwt?.sub}` : 'Connection successful')
        : (data?.error || 'Connection failed');
      await base44.entities.Portal.update(portal.id, {
        connection_status: success ? 'connected' : 'error',
        connection_message: `${baseMessage}${jwtDaysTail}`,
        last_checked_at: new Date().toISOString(),
      });
      qc.invalidateQueries({ queryKey: ['portal-detail', portal.key] });
      qc.invalidateQueries({ queryKey: ['portals-all'] });
      if (success) toast.success(`${portal.name}: connected`);
      else toast.error(`${portal.name}: ${data?.error || 'failed'}`);
    } catch (err) {
      const detail = err.response?.data?.error || err.message;
      await base44.entities.Portal.update(portal.id, {
        connection_status: 'error',
        connection_message: detail,
        last_checked_at: new Date().toISOString(),
      });
      qc.invalidateQueries({ queryKey: ['portal-detail', portal.key] });
      toast.error('Test failed: ' + detail);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Status + Test */}
      <div className="lg:col-span-2 bg-surface-1 border border-line-1 rounded-md p-5">
        <h3 className="text-[13px] font-semibold text-ink-1 mb-3">Connection</h3>

        {cleanMessage && (
          <p className="text-[12px] text-ink-2 bg-surface-2 border border-line-1 rounded px-3 py-2 mb-3">
            {cleanMessage}
          </p>
        )}

        {jwtDays !== null && <div className="mb-3"><JwtExpiryBadge days={jwtDays} /></div>}

        <div className="grid grid-cols-2 gap-3 text-[12px] mb-4">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-ink-4 mb-0.5">Last tested</div>
            <div className="text-ink-2 inline-flex items-center gap-1.5">
              <Clock className="w-3 h-3 text-ink-3" />
              {portal.last_checked_at
                ? formatDistanceToNow(new Date(portal.last_checked_at), { addSuffix: true })
                : 'Never'}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-ink-4 mb-0.5">Last sync</div>
            <div className="text-ink-2 inline-flex items-center gap-1.5">
              <Clock className="w-3 h-3 text-ink-3" />
              {portal.last_sync_at
                ? formatDistanceToNow(new Date(portal.last_sync_at), { addSuffix: true })
                : 'Never'}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleTest}
            disabled={testing || missingSecrets.length > 0}
            className="inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-md bg-accent text-white text-[13px] font-medium hover:bg-[var(--accent-hover)] transition-colors duration-tab disabled:opacity-40"
          >
            {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            {testing ? 'Testing…' : 'Test connection'}
          </button>
          {portal.docs_url && (
            <a
              href={portal.docs_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-line-1 text-[12px] text-ink-2 hover:bg-surface-2 transition-colors duration-tab"
            >
              API docs <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>

      {/* Secrets */}
      <div className="bg-surface-1 border border-line-1 rounded-md p-5">
        <h3 className="text-[13px] font-semibold text-ink-1 mb-3 inline-flex items-center gap-1.5">
          <Key className="w-3.5 h-3.5 text-ink-3" /> Secrets
        </h3>
        {(portal.required_secrets || []).length === 0 ? (
          <p className="text-[12px] text-ink-3 italic-editorial">No secrets required.</p>
        ) : (
          <ul className="space-y-1.5">
            {portal.required_secrets.map((s) => {
              const ok = KNOWN_SECRETS.has(s);
              return (
                <li key={s} className="flex items-center gap-2 text-[12px]">
                  {ok ? (
                    <CheckCircle2 className="w-3 h-3 text-success flex-shrink-0" />
                  ) : (
                    <AlertCircle className="w-3 h-3 text-warning flex-shrink-0" />
                  )}
                  <code className="text-[11px] font-mono text-ink-1">{s}</code>
                  {!ok && <span className="text-[10px] text-warning">missing</span>}
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-[10px] text-ink-4 mt-3 italic-editorial">
          Set secrets in the dashboard → Settings → Environment variables.
        </p>
      </div>
    </div>
  );
}