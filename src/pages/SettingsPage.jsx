import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import HandoffPathSection from '@/components/settings/HandoffPathSection';

const secretGroups = [
  { title: 'Moravia Symfonie', items: ['SYMFONIE_CLIENT_ID', 'SYMFONIE_CLIENT_SECRET', 'SYMFONIE_TENANT_ID', 'SYMFONIE_SERVICE_ACCOUNT'] },
  { title: 'Welocalize Junction', items: ['JUNCTION_JWT (renews ~30 days)', 'JUNCTION_API_KEY (defensive)', 'JUNCTION_API_BASE (optional)'] },
  { title: 'Google Sheets', items: ['GOOGLE_SHEETS_SPREADSHEET_ID (global default)'] },
];

const btn = 'inline-flex items-center gap-2 h-9 px-4 rounded-md border border-line-1 bg-surface-1 text-[13px] text-ink-2 hover:bg-surface-2 transition-colors duration-tab disabled:opacity-40';

// Diagnostics moved onto each connector card (Test connection button there).
// This page is now: global defaults + the secrets reference.
export default function SettingsPage() {
  return (
    <div className="px-8 py-7 max-w-3xl">
      <header className="mb-7">
        <h1 className="text-[22px] font-semibold tracking-tight text-ink-1">Settings</h1>
        <p className="text-[13px] text-ink-3 mt-1 italic-editorial">
          Global defaults and the secrets reference. Per-connector setup lives on each portal card.
        </p>
      </header>

      <div className="space-y-4">
        {/* Dropbox handoff path (global default) */}
        <HandoffPathSection />

        {/* Sheets setup pointer */}
        <section className="bg-surface-1 border border-line-1 rounded-md p-5">
          <h2 className="text-[14px] font-semibold text-ink-1">Google Sheets log</h2>
          <p className="text-[12px] text-ink-3 mt-1 italic-editorial">
            Each connector can log to its own spreadsheet and tab. The header row is created from the connector's edit dialog.
          </p>
          <Link to="/portals" className={`${btn} mt-3`}>
            Configure on connectors <ArrowRight className="w-3.5 h-3.5" />
          </Link>
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