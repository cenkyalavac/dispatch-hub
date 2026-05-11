import { Outlet, useLocation } from 'react-router-dom';
import TopBar from './TopBar';
import SubNav from './SubNav';

// Sub-nav configurations per primary tab
const SUB_NAVS = {
  '/': [],
  '/portals': [
    { to: '/portals',  label: 'All connectors', end: true },
    { to: '/rules',    label: 'Rules' },
    { to: '/settings', label: 'Diagnostics' },
  ],
  '/tasks': [],
  '/pending': [],
};

function resolveSubNav(pathname) {
  // Rules + Settings ride under "Connectors" tab
  if (pathname.startsWith('/rules') || pathname.startsWith('/settings') || pathname.startsWith('/portals')) {
    return SUB_NAVS['/portals'];
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