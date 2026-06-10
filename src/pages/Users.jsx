import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { UserPlus, Trash2, Mail, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/AuthContext';

import InviteUserForm from '@/components/users/InviteUserForm';
import UserAvatar from '@/components/users/UserAvatar';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/ui/EmptyState';
import { EM } from '@/lib/format';

export default function Users() {
  const [showForm, setShowForm] = useState(false);
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin';
  const qc = useQueryClient();

  const { data: users = [], isLoading, isError, error } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list('-created_date', 200),
  });

  const updateRole = useMutation({
    mutationFn: (/** @type {{ id: string, role: string }} */ { id, role }) => base44.entities.User.update(id, { role }),
    onSuccess: () => { toast.success('Role updated'); qc.invalidateQueries({ queryKey: ['users'] }); },
    onError: (err) => toast.error(err?.message || 'Update failed'),
  });

  const removeUser = useMutation({
    mutationFn: (/** @type {string} */ id) => base44.entities.User.delete(id),
    onSuccess: () => { toast.success('User removed'); qc.invalidateQueries({ queryKey: ['users'] }); },
    onError: (err) => toast.error(err?.message || 'Remove failed'),
  });

  const handleClose = () => {
    setShowForm(false);
    qc.invalidateQueries({ queryKey: ['users'] });
  };

  // Non-admins land here in read-only mode. Backend RLS already blocks them
  // from listing other users (the User entity is admin-gated), so they'll
  // see only themselves. Show the explicit lock state instead of pretending
  // the team is empty.
  return (
    <div className="px-8 py-7 max-w-4xl">
      <header className="flex items-end justify-between mb-7">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-ink-1">Team</h1>
          <p className="text-[13px] text-ink-3 mt-1 italic-editorial">
            {isAdmin
              ? "Invite teammates by email — they'll get a link to set up their own login. No Base44 account required."
              : 'Your account on Dispatch Hub. Only admins can manage other teammates.'}
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 h-9 px-4 rounded-md bg-accent text-white text-[13px] font-medium hover:bg-[var(--accent-hover)] transition-colors duration-tab"
          >
            <UserPlus className="w-4 h-4" /> Invite teammate
          </button>
        )}
      </header>

      {isAdmin && showForm && (
        <div className="mb-6">
          <InviteUserForm onClose={handleClose} />
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16" />)}</div>
      ) : isError ? (
        <div className="bg-danger-soft border border-danger/30 rounded-md px-4 py-3 text-[13px] text-danger">
          {error?.message || 'Failed to load users.'}
        </div>
      ) : users.length === 0 ? (
        <EmptyState
          title={isAdmin ? 'No teammates yet' : 'Nothing to show'}
          body={isAdmin
            ? 'Invite someone to give them access to Dispatch Hub.'
            : "You're the only user we can show here. Ask an admin to invite teammates."}
          cta={isAdmin ? () => <><UserPlus className="w-4 h-4" /> Invite teammate</> : undefined}
          action={isAdmin ? () => setShowForm(true) : undefined}
        />
      ) : (
        <div className="bg-surface-1 border border-line-1 rounded-md overflow-hidden">
          {users.map(u => {
            const isMe = u.email === currentUser?.email;
            const userIsAdmin = u.role === 'admin';
            return (
              <div key={u.id} className="flex items-center gap-4 px-4 py-3 border-b border-line-1 last:border-b-0 hover-surface">
                <UserAvatar user={u} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[14px] font-medium text-ink-1 truncate">
                      {u.full_name || <span className="italic-editorial text-ink-3">No name yet</span>}
                    </span>
                    {isMe && <span className="text-[10px] font-mono uppercase tracking-wider text-accent-ink bg-accent-soft px-1.5 py-0.5 rounded">You</span>}
                    {userIsAdmin && <span className="text-[10px] font-mono uppercase tracking-wider text-accent-ink bg-accent-soft px-1.5 py-0.5 rounded">Admin</span>}
                  </div>
                  <p className="text-[12px] text-ink-3 mt-0.5 flex items-center gap-1.5">
                    <Mail className="w-3 h-3" />
                    {u.email || EM}
                  </p>
                </div>
                {isAdmin ? (
                  <>
                    <select
                      value={u.role || 'user'}
                      onChange={e => updateRole.mutate({ id: u.id, role: e.target.value })}
                      disabled={isMe || updateRole.isPending}
                      title={isMe ? "You can't change your own role" : 'Change role'}
                      className="h-8 px-2 rounded border border-line-1 bg-surface-1 text-[12px] outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                    </select>
                    <button
                      onClick={() => {
                        if (confirm(`Remove ${u.full_name || u.email} from this app?`)) removeUser.mutate(u.id);
                      }}
                      disabled={isMe}
                      title={isMe ? "You can't remove yourself" : 'Remove from app'}
                      className="inline-flex items-center justify-center h-8 w-8 rounded text-ink-3 hover:bg-danger-soft hover:text-danger transition-colors duration-tab disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-ink-3"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] text-ink-4" title="Only admins can manage roles">
                    <Lock className="w-3 h-3" />
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}