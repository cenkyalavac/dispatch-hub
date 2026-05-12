import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Command, Hexagon } from 'lucide-react';
import CommandPalette from './CommandPalette';

const TABS = [
  { to: '/',          label: 'Overview',   matches: ['/'] },
  { to: '/pending',   label: 'Pending',    matches: ['/pending'] },
  { to: '/history',   label: 'History',    matches: ['/history'] },
  { to: '/tasks',     label: 'Activity',   matches: ['/tasks'] },
  { to: '/portals',   label: 'Connectors', matches: ['/portals', '/rules', '/settings'] },
  { to: '/api',       label: 'API',        matches: ['/api'] },
];

export default function TopBar() {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { pathname } = useLocation();

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
        <div className="flex items-center gap-2 mr-7">
          <span className="w-6 h-6 rounded-md bg-accent flex items-center justify-center">
            <Hexagon className="w-3.5 h-3.5 text-white" />
          </span>
          <span className="text-[13px] font-semibold tracking-tight text-ink-1">
            Dispatch <span className="italic-editorial text-ink-3 ml-0.5">hub</span>
          </span>
        </div>

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

        <button
          onClick={() => setPaletteOpen(true)}
          className="ml-auto inline-flex items-center gap-2 h-8 px-3 rounded-md border border-line-1 bg-surface-1 hover:bg-surface-2 transition-colors duration-tab text-xs text-ink-3"
        >
          <Command className="w-3.5 h-3.5" />
          <span>Search</span>
          <kbd className="ml-2 px-1.5 py-0.5 rounded bg-surface-2 text-[10px] font-mono text-ink-2">⌘K</kbd>
        </button>
      </header>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </>
  );
}