import { ArrowUpDown, Tags, Building2, Users as UsersIcon } from 'lucide-react';
import SettingsCard from '@/components/settings/SettingsCard';

// Settings is the home for everything administrative — Organization (clients,
// team) and Data shaping (mappings, friendly names). Per-connector config
// (Dropbox paths, Sheets logs, required secrets) lives on each connector card
// where it actually applies. No reason to mirror it here.

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

export default function SettingsPage() {
  return (
    <div className="px-8 py-7 max-w-4xl">
      <header className="mb-7">
        <h1 className="text-[22px] font-semibold tracking-tight text-ink-1">Settings</h1>
        <p className="text-[13px] text-ink-3 mt-1 italic-editorial">
          Manage your organization and how portal data is shaped on the way through Dispatch Hub.
        </p>
      </header>

      <section className="mb-8">
        <h2 className="text-[10px] uppercase tracking-[0.12em] text-ink-3 mb-2.5">Organization</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {ORG_LINKS.map((link) => <SettingsCard key={link.to} {...link} />)}
        </div>
      </section>

      <section>
        <h2 className="text-[10px] uppercase tracking-[0.12em] text-ink-3 mb-2.5">Data shaping</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {SHAPING_LINKS.map((link) => <SettingsCard key={link.to} {...link} />)}
        </div>
      </section>
    </div>
  );
}