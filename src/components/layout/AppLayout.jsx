import { Outlet, useLocation } from 'react-router-dom';
import TopBar from './TopBar';
import SubNav from './SubNav';

// Connectors no longer needs a sub-nav: Rules/Diagnostics live elsewhere
// (Rules under a portal's own tab, Diagnostics in TopBar/Settings).
const SUB_NAVS_API = [
  { to: '/api',      label: 'Keys & webhooks', end: true },
  { to: '/mappings', label: 'Field mappings' },
];

function resolveSubNav(pathname) {
  if (pathname.startsWith('/api') || pathname.startsWith('/mappings')) {
    return SUB_NAVS_API;
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