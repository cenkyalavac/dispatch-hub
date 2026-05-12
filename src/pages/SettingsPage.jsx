import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { CheckCircle2, AlertCircle, ChevronDown, ChevronUp, RefreshCw, Sheet } from 'lucide-react';
import HandoffPathSection from '@/components/settings/HandoffPathSection';

const secretGroups = [
  { title: 'Moravia Symfonie', items: ['SYMFONIE_CLIENT_ID', 'SYMFONIE_CLIENT_SECRET', 'SYMFONIE_TENANT_ID', 'SYMFONIE_SERVICE_ACCOUNT'] },
  { title: 'Welocalize Junction', items: ['JUNCTION_JWT (renews ~30 days)', 'JUNCTION_API_BASE (optional)'] },
  { title: 'Google Sheets', items: ['GOOGLE_SHEETS_SPREADSHEET_ID'] },
];

const btn = 'inline-flex items-center gap-2 h-9 px-4 rounded-md border border-line-1 bg-surface-1 text-[13px] text-ink-2 hover:bg-surface-2 transition-colors duration-tab disabled:opacity-40';

export default function SettingsPage() {
  const [setupLoading, setSetupLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [showRaw, setShowRaw] = useState(false);

  const handleSheetsSetup = async () => {
    setSetupLoading(true);
    try {
      const res = await base44.functions.invoke('sheetsSetupHeader', {});
      if (res.data.success) toast.success('Header row created');
      else toast.error(res.data.error || 'Setup failed');
    } catch (err) { toast.error(err.message); }
    finally { setSetupLoading(false); }
  };

  const handleTestAuth = async () => {
    setTestLoading(true);
    setTestResult(null);
    try {
      const res = await base44.functions.invoke('symfonieAuth', {});
      const data = res.data;
      setTestResult(data);
      if (data.success) toast.success(`Authenticated as ${data.whoami?.Login || 'unknown'}`);
      else toast.error(data.error || 'Connection failed');
    } catch (err) { toast.error(err.message); }
    finally { setTestLoading(false); }
  };

  return (
    <div className="px-8 py-7 max-w-3xl">
      <header className="mb-7">
        <h1 className="text-[22px] font-semibold tracking-tight text-ink-1">Diagnostics</h1>
        <p className="text-[13px] text-ink-3 mt-1 italic-editorial">
          Connection probes, one-time setup, and a quick map of the secrets you’ll need.
        </p>
      </header>

      <div className="space-y-4">
        {/* Symfonie test */}
        <section className="bg-surface-1 border border-line-1 rounded-md p-5">
          <h2 className="text-[14px] font-semibold text-ink-1">Symfonie connection</h2>
          <p className="text-[12px] text-ink-3 mt-1">
            Acquires an Azure AD token and probes <code className="font-mono text-[11px] bg-surface-2 px-1 rounded">/Tasks?$filter=State eq 'Order'</code>.
          </p>
          <button onClick={handleTestAuth} disabled={testLoading} className={`${btn} mt-3`}>
            {testLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
            {testLoading ? 'Testing…' : 'Run test'}
          </button>

          {testResult && (
            <div className="mt-4 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                {[
                  ['Token', testResult.success ? `OK · ${testResult.token_expires_in}s` : 'failed', testResult.success],
                  ['WhoAmI', testResult.whoami_status === 200 ? (testResult.whoami?.Login || 'OK') : `HTTP ${testResult.whoami_status}`, testResult.whoami_status === 200],
                  ['Tasks API', testResult.tasks_api_status === 200 ? `${testResult.tasks_sample?.value?.length ?? 0} task(s)` : `HTTP ${testResult.tasks_api_status}`, testResult.tasks_api_status === 200],
                  ['Sample', testResult.tasks_sample?.value?.[0]?.Name || '—', !!testResult.tasks_sample?.value?.[0]],
                ].map(([k, v, ok]) => (
                  <div key={k} className="flex items-center gap-2 p-2.5 rounded-md bg-surface-2 border border-line-1">
                    {ok ? <CheckCircle2 className="w-3.5 h-3.5 text-success flex-shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 text-warning flex-shrink-0" />}
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-wider text-ink-3">{k}</p>
                      <p className="text-[12px] font-medium truncate text-ink-1">{v}</p>
                    </div>
                  </div>
                ))}
              </div>
              <button
                onClick={() => setShowRaw(v => !v)}
                className="inline-flex items-center gap-1 text-[11px] text-ink-3 hover:text-ink-1 transition-colors duration-tab"
              >
                {showRaw ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                {showRaw ? 'Hide' : 'Show'} raw response
              </button>
              {showRaw && (
                <pre className="bg-surface-2 border border-line-1 p-3 rounded-md text-[11px] overflow-auto max-h-64 font-mono">
                  {JSON.stringify(testResult, null, 2)}
                </pre>
              )}
            </div>
          )}
        </section>

        {/* Dropbox handoff path */}
        <HandoffPathSection />

        {/* Sheets setup */}
        <section className="bg-surface-1 border border-line-1 rounded-md p-5">
          <h2 className="text-[14px] font-semibold text-ink-1">Google Sheets header</h2>
          <p className="text-[12px] text-ink-3 mt-1 italic-editorial">Run once on first install.</p>
          <button onClick={handleSheetsSetup} disabled={setupLoading} className={`${btn} mt-3`}>
            {setupLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sheet className="w-3.5 h-3.5" />}
            {setupLoading ? 'Creating…' : 'Create header row'}
          </button>
        </section>

        {/* Secrets reference */}
        <section className="bg-surface-1 border border-line-1 rounded-md p-5">
          <h2 className="text-[14px] font-semibold text-ink-1">Required secrets</h2>
          <p className="text-[12px] text-ink-3 italic-editorial mt-1">Set via Dashboard → Code → Secrets.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            {secretGroups.map(g => (
              <div key={g.title}>
                <p className="text-[10px] uppercase tracking-wider text-ink-3 mb-2">{g.title}</p>
                <ul className="space-y-1">
                  {g.items.map(s => (
                    <li key={s} className="text-[12px] font-mono text-ink-2 flex items-center gap-2">
                      <span className="w-1 h-1 rounded-full bg-ink-4" /> {s}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}