import { useEffect, useState } from 'react';
import { NavLink, useLocation, Link } from 'react-router-dom';
import { Command, Hexagon, Settings } from 'lucide-react';
import CommandPalette from './CommandPalette';

// Pending tab is the daily-driver — its sub-nav (rendered in AppLayout) shows
// per-portal shortcuts including GlobalLink, so the user never has to type a
// URL to reach the leverage hub. Activity (/tasks) and Probe (/probe) are
// diagnostic surfaces accessible via the Command Palette (⌘K).
const TABS = [
  { to: '/',          label: 'Overview',   matches: ['/'] },
  { to: '/pending',   label: 'Pending',    matches: ['/pending', '/globallink/pending'] },
  { to: '/issues',    label: 'Issues',     matches: ['/issues'] },
  { to: '/history',   label: 'History',    matches: ['/history'] },
  { to: '/portals',   label: 'Connectors', matches: ['/portals', '/rules'] },
  { to: '/api',       label: 'API',        matches: ['/api', '/mappings'] },
];

export default function TopBar() {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { pathname } = useLocation();

  // Sheet destinations live per-connector now — see ConnectorCard's SheetRoutesSummary.
  const isActive = (tab) => {
    if (tab.to === '/') return pathname === '/';
    return tab.matches.some(m => pathname === m || pathname.startsWith(m + '/'));
  };

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
          {TABS.map(t => {
            const active = isActive(t);
            return (
              <NavLink
                key={t.to}
                to={t.to}
                className={`relative h-8 px-3 inline-flex items-center text-[13px] font-medium rounded-md transition-colors duration-tab
                  ${active ? 'text-ink-1' : 'text-ink-3 hover:text-ink-1 hover:bg-surface-2'}`}
              >
                {t.label}
                {active && (
                  <span className="absolute -bottom-[13px] left-2 right-2 h-[2px] bg-accent rounded-full" />
                )}
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
        </div>
      </header>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </>
  );
}