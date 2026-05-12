import { Outlet, useLocation } from 'react-router-dom';
import TopBar from './TopBar';
import SubNav from './SubNav';

const SUB_NAVS_CONNECTORS = [
  { to: '/portals',  label: 'All connectors', end: true },
  { to: '/rules',    label: 'Rules' },
  { to: '/settings', label: 'Diagnostics' },
];

const SUB_NAVS_API = [
  { to: '/api',      label: 'Keys & webhooks', end: true },
  { to: '/mappings', label: 'Field mappings' },
];

function resolveSubNav(pathname) {
  if (pathname.startsWith('/rules') || pathname.startsWith('/settings') || pathname.startsWith('/portals')) {
    return SUB_NAVS_CONNECTORS;
  }
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