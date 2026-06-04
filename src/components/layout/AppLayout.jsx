import { Outlet, useLocation } from 'react-router-dom';
import { ShieldOff } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import TopBar from './TopBar';
import SubNav from './SubNav';

// Connectors no longer needs a sub-nav: Rules/Diagnostics live elsewhere
// (Rules under a portal's own tab, Diagnostics in TopBar/Settings).
const SUB_NAVS_API = [
  { to: '/api',      label: 'Keys & webhooks', end: true },
  { to: '/api/docs', label: 'Documentation' },
];

// Settings is the home for everything administrative: data-shaping rules,
// global defaults, team management, and the agency's client roster. None of
// these belong on the primary nav — they're operator-level config, not
// day-to-day workflow.
const SUB_NAVS_SETTINGS = [
  { to: '/settings',       label: 'General', end: true },
  { to: '/mappings',       label: 'Field mappings' },
  { to: '/friendly-names', label: 'Friendly names' },
  { to: '/clients',        label: 'Clients' },
  { to: '/users',          label: 'Team' },
];

// Pending no longer needs a sub-nav: the TopBar "Pending" menu is a per-portal
// dropdown and each portal has its own dedicated /pending/:key route.
function resolveSubNav(pathname) {
  if (pathname.startsWith('/api')) return SUB_NAVS_API;
  if (
    pathname.startsWith('/settings') ||
    pathname.startsWith('/mappings') ||
    pathname.startsWith('/friendly-names') ||
    pathname.startsWith('/clients') ||
    pathname.startsWith('/users')
  ) {
    return SUB_NAVS_SETTINGS;
  }
  return [];
}

export default function AppLayout() {
  const { pathname } = useLocation();
  const { user, logout } = useAuth();
  const subNav = resolveSubNav(pathname);

  // Admin gate. Every backend function in the Hub rejects non-admin callers
  // with 403; rendering pages that would just show empty data + toast errors
  // is bad UX. Block them with a clear "ask an admin" screen and a Sign out
  // affordance so they can switch accounts without losing context.
  //
  // We trust AuthContext to have resolved `user` before AppLayout mounts —
  // App.jsx already gates on isLoadingAuth and renders a skeleton there.
  if (user && user.role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-6">
        <div className="max-w-md w-full bg-surface-1 border border-line-1 rounded-md p-8 text-center shadow-sm">
          <div className="w-12 h-12 rounded-full bg-warning-soft text-warning inline-flex items-center justify-center mb-4">
            <ShieldOff className="w-6 h-6" />
          </div>
          <h1 className="text-[18px] font-semibold tracking-tight text-ink-1 mb-2">
            Admin access required
          </h1>
          <p className="text-[13px] text-ink-3 italic-editorial mb-5">
            Your account{user.email ? ` (${user.email})` : ''} doesn't have admin permission for Dispatch Hub.
            Ask an admin to grant access, or sign in with a different account.
          </p>
          <button
            onClick={() => logout()}
            className="inline-flex items-center justify-center w-full h-9 rounded-md bg-accent text-white text-[13px] font-medium hover:bg-[var(--accent-hover)] transition-colors duration-tab"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

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