import { useLocation, Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';

export default function PageNotFound() {
  const location = useLocation();
  const pageName = location.pathname.substring(1) || '/';

  const { data: authData, isFetched } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      try { return { user: await base44.auth.me(), isAuthenticated: true }; }
      catch { return { user: null, isAuthenticated: false }; }
    },
  });

  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-background">
      <div className="max-w-md w-full text-center">
        <p className="text-[11px] uppercase tracking-[0.2em] text-ink-4">404</p>
        <h1 className="text-[28px] font-semibold tracking-tight text-ink-1 mt-2">
          Page not found
        </h1>
        <p className="italic-editorial text-[15px] text-ink-3 mt-3 leading-relaxed">
          The route <span className="font-mono not-italic text-ink-2">/{pageName}</span> is not part of this app —
          a beautiful detour, but a detour nonetheless.
        </p>

        {isFetched && authData.isAuthenticated && authData.user?.role === 'admin' && (
          <p className="mt-5 text-[12px] text-ink-3 italic-editorial">
            Admin note: this may simply mean the page hasn’t been built yet.
          </p>
        )}

        <Link
          to="/"
          className="mt-8 inline-flex items-center gap-2 h-9 px-4 rounded-md border border-line-1 bg-surface-1 text-[13px] text-ink-2 hover:bg-surface-2 transition-colors duration-tab"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to overview
        </Link>
      </div>
    </div>
  );
}