// Admin diagnostic page. Pulls the FULL raw probe payload from each portal and
// offers it as a downloadable JSON file. The probe backend is unchanged — we
// just call it with { full: true } so it returns the un-summarized `out` blob.

import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Download, AlertCircle, Loader2 } from 'lucide-react';

const PORTALS = [
  { key: 'all', label: 'All portals' },
  { key: 'globallink', label: 'GlobalLink only' },
  { key: 'symfonie', label: 'Symfonie only' },
  { key: 'junction', label: 'Junction only' },
];

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function PortalProbe() {
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [lastSize, setLastSize] = useState(null);

  const run = async (portalKey) => {
    setBusy(portalKey);
    setError(null);
    setLastSize(null);
    try {
      const res = await base44.functions.invoke('probePortalSamples', {
        portal: portalKey,
        full: true,
      });
      const payload = res?.data;
      if (!payload) throw new Error('Empty response');
      const fname = `portal-probe-${portalKey}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      downloadJson(fname, payload);
      setLastSize(JSON.stringify(payload).length);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-10 px-6">
      <h1 className="text-[20px] font-semibold text-ink-1">Portal probe</h1>
      <p className="mt-1 text-[13px] italic-editorial text-ink-3">
        Pull a raw sample of available submissions/tasks/offers from each portal and download
        as JSON. Use this to inspect what fields actually arrive vs. what BeLazy docs claim.
      </p>

      <div className="mt-6 space-y-2">
        {PORTALS.map(p => (
          <button
            key={p.key}
            disabled={busy !== null}
            onClick={() => run(p.key)}
            className="w-full flex items-center justify-between p-3 rounded-md border border-line-1 bg-surface-1 hover-surface text-[13px] disabled:opacity-50"
          >
            <span className="text-ink-1">{p.label}</span>
            {busy === p.key ? (
              <Loader2 className="w-4 h-4 animate-spin text-ink-3" />
            ) : (
              <Download className="w-4 h-4 text-ink-3" />
            )}
          </button>
        ))}
      </div>

      {lastSize !== null && (
        <p className="mt-4 text-[12px] text-ink-3">
          Downloaded {(lastSize / 1024).toFixed(1)} KB
        </p>
      )}

      {error && (
        <div className="mt-4 flex items-start gap-2 p-3 rounded-md bg-danger-soft border border-danger/30">
          <AlertCircle className="w-4 h-4 text-danger flex-shrink-0 mt-0.5" />
          <p className="text-[12px] text-danger">{error}</p>
        </div>
      )}
    </div>
  );
}