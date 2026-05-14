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
import PendingTasks from './pages/PendingTasks.jsx';
import History from './pages/History.jsx';
import ApiAccess from './pages/ApiAccess.jsx';
import Mappings from './pages/Mappings.jsx';
import Issues from './pages/Issues.jsx';
import GlobalLinkPending from './pages/GlobalLinkPending.jsx';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

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
      navigateToLogin();
      return null;
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
        <Route path="/pending" element={<PendingTasks />} />
        <Route path="/history" element={<History />} />
        <Route path="/api" element={<ApiAccess />} />
        <Route path="/mappings" element={<Mappings />} />
        <Route path="/issues" element={<Issues />} />
        <Route path="/globallink/pending" element={<GlobalLinkPending />} />
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
        <Toaster position="top-right" duration={2200} />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App