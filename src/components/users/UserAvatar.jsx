import { ShieldCheck, User as UserIcon } from 'lucide-react';

// Single source of truth for how a user is rendered in lists. Falls back
// gracefully when full_name is missing (built-in User entity allows that
// while a registered user hasn't logged in yet).
function getInitial(u) {
  const src = (u?.full_name || u?.email || '').trim();
  return (src[0] || '?').toUpperCase();
}

export default function UserAvatar({ user, size = 32 }) {
  const isAdmin = user?.role === 'admin';
  const initial = getInitial(user);
  const hasName = !!user?.full_name;

  return (
    <div
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
      className={`rounded-full flex items-center justify-center flex-shrink-0 font-semibold
        ${isAdmin ? 'bg-accent text-white' : 'bg-surface-2 text-ink-2'}`}
      aria-hidden
    >
      {hasName ? (
        initial
      ) : isAdmin ? (
        <ShieldCheck className="w-4 h-4" />
      ) : (
        <UserIcon className="w-4 h-4" />
      )}
    </div>
  );
}