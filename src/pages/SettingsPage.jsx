import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpDown, Tags, Sheet, KeyRound, Building2, Users as UsersIcon } from 'lucide-react';
import HandoffPathSection from '@/components/settings/HandoffPathSection';
import SettingsCard from '@/components/settings/SettingsCard';

// Settings is the home for global defaults and data-shaping config.
// Field Mappings / Friendly Names live here (not under API) because they
// normalize portal data on its way through Dispatch Hub, independent of
// whether anyone consumes the API. The sub-nav exposes them as siblings of
// this General page.
const SHAPING_LINKS = [
  {
    to: '/mappings',
    icon: ArrowUpDown,
    title: 'Field mappings',
    body: 'Translate source-portal values (e.g. "Apple Inc.") into the destination values your BMS expects ("APPLE_BMS"). Null-on-miss.',
  },
  {
    to: '/friendly-names',
    icon: Tags,
    title: 'Friendly names',
    body: 'Short display labels for clients, accounts, projects and workflows. Used UI-side and on outgoing surfaces. Passthrough on miss.',
  },
];

const ORG_LINKS = [
  {
    to: '/clients',
    icon: Building2,
    title: 'Clients',
    body: "Your agency's end-customers. Each connector is mapped to a client so accepted tasks carry the right attribution.",
  },
  {
    to: '/users',
    icon: UsersIcon,
    title: 'Team',
    body: 'Invite teammates and manage their roles. Admins can connect portals and manage settings; users can accept and reject tasks.',
  },
];

const secretGroups = [
  { title: 'Moravia Symfonie', items: ['SYMFONIE_CLIENT_ID', 'SYMFONIE_CLIENT_SECRET', 'SYMFONIE_TENANT_ID', 'SYMFONIE_SERVICE_ACCOUNT'] },
  { title: 'Welocalize Junction', items: ['JUNCTION_JWT (renews ~30 days)', 'JUNCTION_API_KEY (defensive)'] },
  { title: 'Google Sheets', items: ['GOOGLE_SHEETS_SPREADSHEET_ID (global default)'] },
];

export default function SettingsPage() {
  return (
    <div className="px-8 py-7 max-w-4xl">
      <header className="mb-7">
        <h1 className="text-[22px] font-semibold tracking-tight text-ink-1">Settings</h1>
        <p className="text-[13px] text-ink-3 mt-1 italic-editorial">
          Global defaults, data-shaping rules, and the secrets reference.
        </p>
      </header>

      {/* Organization — your clients and your team. */}
      <section className="mb-8">
        <h2 className="text-[10px] uppercase tracking-[0.12em] text-ink-3 mb-2.5">Organization</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {ORG_LINKS.map((link) => <SettingsCard key={link.to} {...link} />)}
        </div>
      </section>

      {/* Data shaping — the two sibling pages live here. */}
      <section className="mb-8">
        <h2 className="text-[10px] uppercase tracking-[0.12em] text-ink-3 mb-2.5">Data shaping</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {SHAPING_LINKS.map((link) => <SettingsCard key={link.to} {...link} />)}
        </div>
      </section>

      {/* Global defaults */}
      <section className="mb-8">
        <h2 className="text-[10px] uppercase tracking-[0.12em] text-ink-3 mb-2.5">Global defaults</h2>
        <div className="space-y-3">
          <HandoffPathSection />

          <div className="bg-surface-1 border border-line-1 rounded-md p-5">
            <div className="flex items-start gap-3">
              <span className="w-8 h-8 rounded-md bg-surface-2 text-ink-2 flex items-center justify-center shrink-0">
                <Sheet className="w-4 h-4" />
              </span>
              <div className="flex-1">
                <h3 className="text-[14px] font-semibold text-ink-1">Google Sheets log</h3>
                <p className="text-[12px] text-ink-3 italic-editorial mt-0.5">
                  Each connector logs to its own spreadsheet and tab. Headers are configured from the connector's edit dialog.
                </p>
                <Link
                  to="/portals"
                  className="inline-flex items-center gap-1.5 mt-3 h-8 px-3 rounded-md border border-line-1 text-[12px] text-ink-2 hover:bg-surface-2 transition-colors duration-tab"
                >
                  Configure on connectors <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Secrets reference */}
      <section>
        <h2 className="text-[10px] uppercase tracking-[0.12em] text-ink-3 mb-2.5">Required secrets</h2>
        <div className="bg-surface-1 border border-line-1 rounded-md p-5">
          <div className="flex items-start gap-3 mb-4">
            <span className="w-8 h-8 rounded-md bg-surface-2 text-ink-2 flex items-center justify-center shrink-0">
              <KeyRound className="w-4 h-4" />
            </span>
            <p className="text-[12px] text-ink-3 italic-editorial mt-1">
              Set via Dashboard → Code → Secrets. Per-connector secret hints surface on each connector card.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pl-11">
            {secretGroups.map(g => (
              <div key={g.title}>
                <p className="text-[10px] uppercase tracking-wider text-ink-3 mb-2">{g.title}</p>
                <ul className="space-y-1">
                  {g.items.map(s => (
                    <li key={s} className="text-[11.5px] font-mono text-ink-2 flex items-center gap-2 leading-relaxed">
                      <span className="w-1 h-1 rounded-full bg-ink-4 shrink-0" /> {s}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}