import { Outlet, useLocation } from 'react-router-dom';
import TopBar from './TopBar';
import SubNav from './SubNav';

// Connectors no longer needs a sub-nav: Rules/Diagnostics live elsewhere
// (Rules under a portal's own tab, Diagnostics in TopBar/Settings).
const SUB_NAVS_API = [
  { to: '/api',      label: 'Keys & webhooks', end: true },
  { to: '/api/docs', label: 'Documentation' },
];

// Settings is the home for data-shaping config (mappings, friendly names) and
// global defaults. Field Mappings / Friendly Names belong here, not under API:
// they normalize portal data on its way through Dispatch Hub, regardless of
// whether anyone ever consumes the API.
const SUB_NAVS_SETTINGS = [
  { to: '/settings',       label: 'General', end: true },
  { to: '/mappings',       label: 'Field mappings' },
  { to: '/friendly-names', label: 'Friendly names' },
];

// Pending no longer needs a sub-nav: the TopBar "Pending" menu is a per-portal
// dropdown and each portal has its own dedicated /pending/:key route.
function resolveSubNav(pathname) {
  if (pathname.startsWith('/api')) return SUB_NAVS_API;
  if (pathname.startsWith('/settings') || pathname.startsWith('/mappings') || pathname.startsWith('/friendly-names')) {
    return SUB_NAVS_SETTINGS;
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