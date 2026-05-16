import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { base44 } from '@/api/base44Client';

// Bell icon in the top bar — shows an unread count badge.
// Lightweight poll (every 60s) is fine for an in-app indicator; the bell
// itself doesn't need real-time precision.
export default function NotificationBell() {
  const { data: unread = [] } = useQuery({
    queryKey: ['user-notifications-unread'],
    queryFn: () => base44.entities.UserNotification.filter({ read_at: null }, '-created_date', 50),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const count = unread.length;

  return (
    <Link
      to="/notifications?tab=inbox"
      aria-label={`Notifications (${count} unread)`}
      className="relative inline-flex items-center justify-center w-8 h-8 rounded-md border border-line-1 bg-surface-1 text-ink-3 hover:bg-surface-2 hover:text-ink-1 transition-colors duration-tab"
    >
      <Bell className="w-3.5 h-3.5" />
      {count > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-danger text-white text-[10px] font-semibold flex items-center justify-center tabular-nums">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  );
}