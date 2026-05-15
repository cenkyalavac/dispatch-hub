import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { UserPlus, Trash2, ShieldCheck, User as UserIcon, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/AuthContext';

import InviteUserForm from '@/components/users/InviteUserForm';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/ui/EmptyState';
import { EM } from '@/lib/format';

export default function Users() {
  const [showForm, setShowForm] = useState(false);
  const { user: currentUser } = useAuth();
  const qc = useQueryClient();

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list('-created_date', 200),
  });

  const updateRole = useMutation({
    mutationFn: ({ id, role }) => base44.entities.User.update(id, { role }),
    onSuccess: () => { toast.success('Role updated'); qc.invalidateQueries({ queryKey: ['users'] }); },
    onError: (err) => toast.error(err?.message || 'Update failed'),
  });

  const removeUser = useMutation({
    mutationFn: (id) => base44.entities.User.delete(id),
    onSuccess: () => { toast.success('User removed'); qc.invalidateQueries({ queryKey: ['users'] }); },
    onError: (err) => toast.error(err?.message || 'Remove failed'),
  });

  const handleClose = () => {
    setShowForm(false);
    qc.invalidateQueries({ queryKey: ['users'] });
  };

  return (
    <div className="px-8 py-7 max-w-4xl">
      <header className="flex items-end justify-between mb-7">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-ink-1">Team</h1>
          <p className="text-[13px] text-ink-3 mt-1 italic-editorial">
            Invite teammates by email — they’ll get a link to set up their own login. No Base44 account required.
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-2 h-9 px-4 rounded-md bg-accent text-white text-[13px] font-medium hover:bg-[var(--accent-hover)] transition-colors duration-tab"
        >
          <UserPlus className="w-4 h-4" /> Invite teammate
        </button>
      </header>

      {showForm && (
        <div className="mb-6">
          <InviteUserForm onClose={handleClose} />
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16" />)}</div>
      ) : users.length === 0 ? (
        <EmptyState
          title="No teammates yet"
          body="Invite someone to give them access to Dispatch Hub."
          cta={() => <><UserPlus className="w-4 h-4" /> Invite teammate</>}
          action={() => setShowForm(true)}
        />
      ) : (
        <div className="bg-surface-1 border border-line-1 rounded-md overflow-hidden">
          {users.map(u => {
            const isMe = u.email === currentUser?.email;
            const isAdmin = u.role === 'admin';
            return (
              <div key={u.id} className="flex items-center gap-4 px-4 py-3 border-b border-line-1 last:border-b-0 hover-surface">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isAdmin ? 'bg-accent-soft text-accent-ink' : 'bg-surface-2 text-ink-3'}`}>
                  {isAdmin ? <ShieldCheck className="w-4 h-4" /> : <UserIcon className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[14px] font-medium text-ink-1 truncate">{u.full_name || EM}</span>
                    {isMe && <span className="text-[10px] font-mono uppercase tracking-wider text-accent-ink bg-accent-soft px-1.5 py-0.5 rounded">You</span>}
                    {!u.is_verified && <span className="text-[10px] font-mono uppercase tracking-wider text-warning bg-warning-soft px-1.5 py-0.5 rounded">Pending</span>}
                  </div>
                  <p className="text-[12px] text-ink-3 mt-0.5 flex items-center gap-1.5">
                    <Mail className="w-3 h-3" />
                    {u.email}
                  </p>
                </div>
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}