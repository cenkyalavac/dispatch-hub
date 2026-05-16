import { useEffect, useState } from 'react';
import { NavLink, useLocation, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Command, Hexagon, Settings, ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import CommandPalette from './CommandPalette';
import NotificationBell from '@/components/notifications/NotificationBell';
import UserMenu from './UserMenu';

// Pending is a dropdown — one item per active portal. Clicking opens that
// portal's dedicated pending page (/pending/:key, or /globallink/pending for
// GlobalLink which has its own entity-backed data shape).
const TABS = [
  { to: '/',          label: 'Overview',   matches: ['/'] },
  { to: '/portals',   label: 'Connectors', matches: ['/portals', '/rules'] },
  { to: '/api',       label: 'API',        matches: ['/api'] },
];

// Pending lists live inside each connector's own detail page (Pending tab) —
// uniformly for every portal, including GlobalLink. Legacy standalone pending
// pages are retired.
function pendingHref(portal) {
  return `/portals/${portal.key}?tab=pending`;
}

export default function TopBar() {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { pathname } = useLocation();

  const { data: portals = [] } = useQuery({
    queryKey: ['portals-all'],
    queryFn: () => base44.entities.Portal.list(),
  });
  const activePortals = portals.filter((p) => p.is_active);

  const isActive = (tab) => {
    if (tab.to === '/') return pathname === '/';
    return tab.matches.some(m => pathname === m || pathname.startsWith(m + '/'));
  };
  // Pending dropdown is "active" when on /globallink/pending, legacy /pending/*,
  // or on any portal detail page with the pending tab open. We can't read the
  // query string from pathname alone, so also check window.location.search here.
  const pendingActive =
    pathname.startsWith('/portals/') && typeof window !== 'undefined' && window.location.search.includes('tab=pending');

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <header
        style={{ height: 52 }}
        className="sticky top-0 z-40 bg-surface-1/95 backdrop-blur border-b border-line-1 flex items-center px-5"
      >
        <Link
          to="/"
          className="flex items-center gap-2 mr-7 group"
          aria-label="Go to overview"
        >
          <span className="w-6 h-6 rounded-md bg-accent flex items-center justify-center group-hover:bg-[var(--accent-hover)] transition-colors duration-tab">
            <Hexagon className="w-3.5 h-3.5 text-white" />
          </span>
          <span className="text-[13px] font-semibold tracking-tight text-ink-1">
            Dispatch <span className="italic-editorial text-ink-3 ml-0.5">Hub</span>
          </span>
        </Link>

        <nav className="flex items-center gap-1">
          {/* Overview */}
          <NavLink
            to="/"
            className={`relative h-8 px-3 inline-flex items-center text-[13px] font-medium rounded-md transition-colors duration-tab
              ${isActive(TABS[0]) ? 'text-ink-1' : 'text-ink-3 hover:text-ink-1 hover:bg-surface-2'}`}
          >
            Overview
            {isActive(TABS[0]) && <span className="absolute -bottom-[13px] left-2 right-2 h-[2px] bg-accent rounded-full" />}
          </NavLink>

          {/* Pending — dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={`relative h-8 px-3 inline-flex items-center gap-1 text-[13px] font-medium rounded-md transition-colors duration-tab outline-none
                  ${pendingActive ? 'text-ink-1' : 'text-ink-3 hover:text-ink-1 hover:bg-surface-2'}`}
              >
                Pending
                <ChevronDown className="w-3 h-3 opacity-70" />
                {pendingActive && <span className="absolute -bottom-[13px] left-2 right-2 h-[2px] bg-accent rounded-full" />}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[180px]">
              {activePortals.length === 0 ? (
                <DropdownMenuItem disabled>No active portals</DropdownMenuItem>
              ) : (
                activePortals.map((p) => (
                  <DropdownMenuItem key={p.key} asChild>
                    <Link to={pendingHref(p)} className="cursor-pointer w-full">
                      {p.name}
                    </Link>
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Other primary tabs */}
          {TABS.slice(1).map(t => {
            const active = isActive(t);
            return (
              <NavLink
                key={t.to}
                to={t.to}
                className={`relative h-8 px-3 inline-flex items-center text-[13px] font-medium rounded-md transition-colors duration-tab
                  ${active ? 'text-ink-1' : 'text-ink-3 hover:text-ink-1 hover:bg-surface-2'}`}
              >
                {t.label}
                {active && <span className="absolute -bottom-[13px] left-2 right-2 h-[2px] bg-accent rounded-full" />}
              </NavLink>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setPaletteOpen(true)}
            className="inline-flex items-center gap-2 h-8 px-3 rounded-md border border-line-1 bg-surface-1 hover:bg-surface-2 transition-colors duration-tab text-xs text-ink-3"
          >
            <Command className="w-3.5 h-3.5" />
            <span>Search</span>
            <kbd className="ml-2 px-1.5 py-0.5 rounded bg-surface-2 text-[10px] font-mono text-ink-2">⌘K</kbd>
          </button>
          <NotificationBell />
          <NavLink
            to="/settings"
            aria-label="Settings"
            className={({ isActive }) =>
              `inline-flex items-center justify-center w-8 h-8 rounded-md border border-line-1 transition-colors duration-tab
               ${isActive ? 'bg-surface-2 text-ink-1' : 'bg-surface-1 text-ink-3 hover:bg-surface-2 hover:text-ink-1'}`
            }
          >
            <Settings className="w-3.5 h-3.5" />
          </NavLink>
          <UserMenu />
        </div>
      </header>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </>
  );
}