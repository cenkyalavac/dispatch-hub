import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Search, Command } from 'lucide-react';
import CommandPalette from './CommandPalette.jsx';

const NAV = [
  { to: '/',            label: 'Overview', end: true },
  { to: '/pending',     label: 'Pending' },
  { to: '/issues',      label: 'Issues' },
  { to: '/history',     label: 'History' },
  { to: '/tasks',       label: 'Activity' },
  { to: '/portals',     label: 'Connectors' },
  { to: '/rules',       label: 'Rules' },
  { to: '/notifications', label: 'Notifications' },
  { to: '/api',         label: 'API' },
  { to: '/settings',    label: 'Settings' },
];

export default function AppLayout() {
  const [paletteOpen, setPaletteOpen] = useState(false);

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
    <div className="min-h-screen bg-bg">
      <header
        style={{ height: 52 }}
        className="sticky top-0 z-40 bg-surface-1 border-b border-line-1 flex items-center px-5 gap-6"
      >
        <div className="text-[13px] font-semibold text-ink-1 tracking-tight">Dispatch</div>
        <nav className="flex items-center gap-0.5 overflow-x-auto flex-1">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `h-7 px-2.5 inline-flex items-center text-[12px] font-medium rounded transition-colors duration-tab whitespace-nowrap
                ${isActive ? 'text-ink-1 bg-surface-2' : 'text-ink-3 hover:text-ink-1 hover:bg-surface-2'}`
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <button
          onClick={() => setPaletteOpen(true)}
          className="inline-flex items-center gap-2 h-7 px-2.5 text-[11px] text-ink-3 hover:text-ink-1 hover:bg-surface-2 rounded transition-colors duration-tab"
          title="Jump to…"
        >
          <Search className="w-3 h-3" />
          <span>Jump to</span>
          <kbd className="font-mono text-[10px] text-ink-4 inline-flex items-center gap-0.5">
            <Command className="w-2.5 h-2.5" />K
          </kbd>
        </button>
      </header>

      <main>
        <Outlet />
      </main>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}