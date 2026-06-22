import { Toaster } from 'sonner';
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import AppLayout from '@/components/layout/AppLayout';
import Dashboard from './pages/Dashboard.jsx';
import Rules from './pages/Rules';
import Tasks from './pages/Tasks';
import SettingsPage from './pages/SettingsPage';
import Connectors from './pages/Connectors.jsx';
import PortalDetail from './pages/PortalDetail.jsx';
import History from './pages/History.jsx';
import ApiAccess from './pages/ApiAccess.jsx';
import Documentation from './pages/Documentation.jsx';
import Mappings from './pages/Mappings.jsx';
import Issues from './pages/Issues.jsx';
import PortalProbe from './pages/PortalProbe.jsx';
import Notifications from './pages/Notifications.jsx';
import Users from './pages/Users.jsx';
import AcceptToken from './pages/AcceptToken.jsx';
import FriendlyNames from './pages/FriendlyNames.jsx';
import Clients from './pages/Clients.jsx';
import WorldServerInbox from './pages/WorldServerInbox.jsx';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  // Public bypass: the /accept page is reached from one-click email links
  // where the recipient has no app token and may not even have an account.
  // Render it BEFORE the auth gate so it works in an incognito tab.
  if (typeof window !== 'undefined' && window.location.pathname === '/accept') {
    return (
      <Routes>
        <Route path="/accept" element={<AcceptToken />} />
      </Routes>
    );
  }

  if (isLoadingPublicSettings || isLoadingAuth) {
    // Doctrine: Skeleton primitive, never spinner.
    return (
      <div className="fixed inset-0 flex items-start justify-center pt-[20vh] px-6">
        <div className="w-full max-w-md space-y-3">
          <div className="skel h-4 w-1/3" />
          <div className="skel h-3 w-2/3" />
          <div className="skel h-3 w-1/2" />
        </div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Kick off the redirect, but also render a visible Sign-in screen so
      // the user isn't staring at a blank page if the redirect is blocked
      // (popup blocker, iframe, slow network). Previously this returned null
      // and showed nothing, which is exactly the symptom that prompted this
      // pass — "I couldn't tell I wasn't logged in."
      navigateToLogin();
      return (
        <div className="min-h-screen flex items-center justify-center bg-background px-6">
          <div className="max-w-sm w-full bg-surface-1 border border-line-1 rounded-md p-8 shadow-sm text-center">
            <h1 className="text-[18px] font-semibold tracking-tight text-ink-1 mb-2">Sign in to Dispatch Hub</h1>
            <p className="text-[13px] text-ink-3 italic-editorial mb-5">
              Redirecting you to sign in… if nothing happens in a moment, click the button below.
            </p>
            <button
              onClick={() => navigateToLogin()}
              className="inline-flex items-center justify-center w-full h-9 rounded-md bg-accent text-white text-[13px] font-medium hover:bg-[var(--accent-hover)] transition-colors duration-tab"
            >
              Sign in
            </button>
          </div>
        </div>
      );
    }
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/rules" element={<Rules />} />
        <Route path="/tasks" element={<Tasks />} />
        <Route path="/portals" element={<Connectors />} />
        <Route path="/portals/:key" element={<PortalDetail />} />
        <Route path="/history" element={<History />} />
        <Route path="/api" element={<ApiAccess />} />
        <Route path="/api/docs" element={<Documentation />} />
        <Route path="/mappings" element={<Mappings />} />
        <Route path="/friendly-names" element={<FriendlyNames />} />
        <Route path="/issues" element={<Issues />} />
        <Route path="/probe" element={<PortalProbe />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/users" element={<Users />} />
        <Route path="/clients" element={<Clients />} />
        <Route path="/worldserver" element={<WorldServerInbox />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <AuthenticatedApp />
        </Router>
        <Toaster position="top-right" duration={2200} closeButton gap={8} className="max-w-[calc(100vw-2rem)]" />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App