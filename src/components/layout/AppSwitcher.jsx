import { LayoutGrid, Check } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Eltur service constellation. Hub is this app — the integrator/middleware
// that polls vendor portals and exposes the unified BMS API. Dispatch is the
// user-facing consumer. QA and ELTS are sibling tools. All share the same
// auth, so links are plain cross-domain navigations (no SSO handshake needed
// at the app layer).
const SERVICES = [
  {
    name: 'Dispatch',
    tagline: 'Project lifecycle',
    url: 'https://dispatch.eltur.co',
    domain: 'dispatch.eltur.co',
  },
  {
    name: 'Hub',
    tagline: 'Integrator',
    url: 'https://hub.eltur.co',
    domain: 'hub.eltur.co',
  },
  {
    name: 'QA',
    tagline: 'Quality assurance',
    url: 'https://qa.eltur.co',
    domain: 'qa.eltur.co',
  },
  {
    name: 'ELTS',
    tagline: 'Eltur Tools',
    url: 'https://elts.eltur.co',
    domain: 'elts.eltur.co',
  },
];

export default function AppSwitcher() {
  const currentHost = typeof window !== 'undefined' ? window.location.hostname : '';
  const isCurrent = (svc) => currentHost === svc.domain;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="Switch Eltur service"
          className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-line-1 bg-surface-1 text-ink-3 hover:bg-surface-2 hover:text-ink-1 transition-colors duration-tab"
        >
          <LayoutGrid className="w-3.5 h-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 p-1.5">
        <DropdownMenuLabel className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-3">
          Eltur services
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {SERVICES.map((svc) => {
          const active = isCurrent(svc);
          return (
            <DropdownMenuItem key={svc.domain} asChild>
              <a
                href={svc.url}
                className={`flex items-center gap-3 px-2 py-2 rounded-md cursor-pointer ${
                  active ? 'bg-accent-soft' : ''
                }`}
              >
                <span
                  className={`w-8 h-8 rounded-md flex items-center justify-center text-[12px] font-semibold tracking-tight ${
                    active
                      ? 'bg-accent text-white'
                      : 'bg-surface-2 text-ink-2'
                  }`}
                >
                  {svc.name.slice(0, 2).toUpperCase()}
                </span>
                <span className="flex-1 min-w-0">
                  <span className={`block text-[13px] font-medium ${active ? 'text-ink-1' : 'text-ink-1'}`}>
                    {svc.name}
                  </span>
                  <span className="block text-[11px] text-ink-3 italic-editorial truncate">
                    {svc.tagline}
                  </span>
                </span>
                {active && <Check className="w-3.5 h-3.5 text-accent" />}
              </a>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}