import { formatDistanceToNow } from 'date-fns';
import { KeyRound, Trash2 } from 'lucide-react';

export default function ApiKeyCard({ apiKey, onRevoke }) {
  const revoked = !!apiKey.revoked_at;
  return (
    <div className={`bg-surface-1 border border-line-1 rounded-md p-4 flex items-center gap-4 ${revoked ? 'opacity-60' : ''}`}>
      <div className="w-8 h-8 rounded-md bg-surface-2 flex items-center justify-center flex-shrink-0">
        <KeyRound className="w-3.5 h-3.5 text-ink-3" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-[13px] font-semibold text-ink-1 truncate">{apiKey.name}</p>
          <span className="text-[10px] uppercase tracking-wider bg-surface-2 text-ink-3 px-1.5 py-0.5 rounded">
            {apiKey.tenant_id || 'default'}
          </span>
          {revoked && (
            <span className="text-[10px] uppercase tracking-wider bg-danger-soft text-danger px-1.5 py-0.5 rounded">revoked</span>
          )}
        </div>
        <p className="text-[11px] font-mono text-ink-3 mt-0.5">{apiKey.token_prefix}…</p>
        <p className="text-[11px] text-ink-3 italic-editorial mt-0.5">
          {apiKey.last_used_at
            ? `Last used ${formatDistanceToNow(new Date(apiKey.last_used_at), { addSuffix: true })}`
            : 'Never used'}
          {' · '}scopes: {(apiKey.scopes || []).join(', ') || '—'}
        </p>
      </div>
      {!revoked && (
        <button
          onClick={() => onRevoke(apiKey)}
          className="inline-flex items-center gap-1 h-7 px-2.5 rounded text-[11px] text-danger hover:bg-danger-soft transition-colors duration-tab"
        >
          <Trash2 className="w-3 h-3" /> Revoke
        </button>
      )}
    </div>
  );
}