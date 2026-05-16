import { ShieldAlert, LogOut } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';

// Shown when the signed-in Base44 account isn't on Dispatch Hub's user list.
// Re-skinned to the OKLCH design system and given a "Sign out & try again"
// action so the user doesn't get stuck on a dead-end screen.
export default function UserNotRegisteredError() {
  const { logout } = useAuth();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6">
      <div className="max-w-md w-full bg-surface-1 border border-line-1 rounded-md p-8 shadow-sm">
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-warning-soft mb-5">
          <ShieldAlert className="w-5 h-5 text-warning" />
        </div>
        <h1 className="text-[20px] font-semibold tracking-tight text-ink-1 mb-2">Access restricted</h1>
        <p className="text-[13px] text-ink-2 leading-relaxed mb-5">
          You're signed in, but your account isn't on Dispatch Hub's user list yet. Ask an admin to invite you,
          or sign in with a different account.
        </p>
        <div className="bg-surface-2 border border-line-1 rounded-md px-4 py-3 mb-5 text-[12px] text-ink-3 italic-editorial leading-relaxed">
          Tip: the invite email goes to the exact address you sign in with. If you have more than one Base44
          account, pick the one your admin invited.
        </div>
        <button
          onClick={() => logout(true)}
          className="inline-flex items-center justify-center gap-2 w-full h-9 rounded-md bg-accent text-white text-[13px] font-medium hover:bg-[var(--accent-hover)] transition-colors duration-tab"
        >
          <LogOut className="w-4 h-4" /> Sign out and try a different account
        </button>
      </div>
    </div>
  );
}