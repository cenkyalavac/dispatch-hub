import { useAuth } from '@/lib/AuthContext';
import { LogOut, ShieldCheck, User as UserIcon } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Compact identity affordance for the TopBar. Renders an avatar (first letter
// of the user's name or email) plus a dropdown showing who you're signed in
// as, your role, and a Logout action. Solves the "Team list looks empty —
// am I even logged in?" UX gap.
function getInitial(user) {
  if (!user) return '?';
  const src = user.full_name || user.email || '';
  return (src.trim()[0] || '?').toUpperCase();
}

export default function UserMenu() {
  const { user, isAuthenticated, navigateToLogin, logout } = useAuth();

  // Not signed in — render a clearly labelled Sign-in button instead of a
  // silent avatar. This is the original failure mode the user hit on /users.
  if (!isAuthenticated || !user) {
    return (
      <button
        onClick={() => navigateToLogin()}
        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-line-1 bg-surface-1 text-[12px] font-medium text-ink-2 hover:bg-surface-2 hover:text-ink-1 transition-colors duration-tab"
      >
        <UserIcon className="w-3.5 h-3.5" />
        Sign in
      </button>
    );
  }

  const isAdmin = user.role === 'admin';
  const display = user.full_name || user.email;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={`Account menu for ${display}`}
          className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-accent text-white text-[12px] font-semibold border border-line-1 hover:bg-[var(--accent-hover)] transition-colors duration-tab"
        >
          {getInitial(user)}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[220px]">
        <DropdownMenuLabel>
          <div className="flex flex-col gap-0.5">
            <span className="text-[13px] font-medium text-ink-1 truncate">{display}</span>
            {user.full_name && (
              <span className="text-[11px] text-ink-3 truncate font-normal">{user.email}</span>
            )}
            <span className={`mt-1 inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider w-fit px-1.5 py-0.5 rounded ${isAdmin ? 'text-accent-ink bg-accent-soft' : 'text-ink-3 bg-surface-2'}`}>
              {isAdmin && <ShieldCheck className="w-3 h-3" />}
              {user.role || 'user'}
            </span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => logout()} className="cursor-pointer">
          <LogOut className="w-3.5 h-3.5 mr-2" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}