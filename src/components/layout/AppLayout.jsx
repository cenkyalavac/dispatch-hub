import { Outlet, useLocation } from 'react-router-dom';
import TopBar from './TopBar';
import SubNav from './SubNav';

// Connectors no longer needs a sub-nav: Rules/Diagnostics live elsewhere
// (Rules under a portal's own tab, Diagnostics in TopBar/Settings).
const SUB_NAVS_API = [
  { to: '/api',      label: 'Keys & webhooks', end: true },
  { to: '/mappings', label: 'Field mappings' },
];

// Pending sub-nav: All = the unified /pending page (Symfonie+Junction via
// fetch_function). GlobalLink has its own entity-backed table — this link
// jumps straight to it so the user doesn't need to remember the URL.
const SUB_NAVS_PENDING = [
  { to: '/pending',             label: 'All portals', end: true },
  { to: '/globallink/pending',  label: 'GlobalLink' },
];

function resolveSubNav(pathname) {
  if (pathname.startsWith('/api') || pathname.startsWith('/mappings')) {
    return SUB_NAVS_API;
  }
  if (pathname === '/pending' || pathname.startsWith('/globallink/pending')) {
    return SUB_NAVS_PENDING;
  }
  return [];
}

export default function AppLayout() {
  const { pathname } = useLocation();
  const subNav = resolveSubNav(pathname);

  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <SubNav items={subNav} />
      <main className="min-h-[calc(100vh-52px)]">
        <Outlet />
      </main>
    </div>
  );
}