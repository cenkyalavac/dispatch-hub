import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation } from '@tanstack/react-query';
import { X, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import FormField from '@/components/ui/FormField';

const fieldCls = 'w-full h-9 px-3 rounded-md border border-line-1 bg-surface-1 text-[13px] outline-none placeholder:text-ink-4';
const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s).trim());

export default function InviteUserForm({ onClose }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('user');
  const [error, setError] = useState('');

  const inviteMutation = useMutation({
    // Base44 sends the invite email and creates a pending User record. The
    // invitee accepts via the email link — no manual user provisioning needed.
    mutationFn: ({ email, role }) => base44.users.inviteUser(email, role),
    onSuccess: () => { toast.success(`Invite sent to ${email}`); onClose(); },
    onError: (err) => toast.error(err?.message || 'Invite failed'),
  });

  const handleSubmit = () => {
    const e = email.trim();
    if (!isEmail(e)) { setError('Enter a valid email address'); return; }
    setError('');
    inviteMutation.mutate({ email: e, role });
  };

  return (
    <div className="bg-surface-1 border border-accent/30 rounded-md p-5 animate-slide-down">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[14px] font-semibold text-ink-1">Invite teammate</h2>
        <button onClick={onClose} className="inline-flex items-center justify-center h-7 w-7 rounded text-ink-3 hover:bg-surface-2 transition-colors duration-tab">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="col-span-2">
          <FormField label="Email" required error={error} htmlFor="inv-email">
            <input
              id="inv-email"
              type="email"
              className={fieldCls}
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="teammate@example.com"
              autoFocus
            />
          </FormField>
        </div>
        <FormField label="Role" helper="Admin can manage everything">
          <select value={role} onChange={e => setRole(e.target.value)} className={fieldCls}>
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
        </FormField>
      </div>

      <p className="text-[12px] text-ink-3 italic-editorial mb-4">
        Base44 will email an invite link. They’ll set their own password and join this app — no Base44 account needed beforehand.
      </p>

      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={inviteMutation.isPending}
          className="inline-flex items-center justify-center gap-2 h-9 px-4 rounded-md bg-accent text-white text-[13px] font-medium hover:bg-[var(--accent-hover)] transition-colors duration-tab disabled:opacity-40 flex-1"
        >
          <UserPlus className="w-4 h-4" />
          {inviteMutation.isPending ? 'Sending…' : 'Send invite'}
        </button>
        <button onClick={onClose} className="h-9 px-4 rounded-md border border-line-1 text-[13px] text-ink-2 hover:bg-surface-2 transition-colors duration-tab">
          Cancel
        </button>
      </div>
    </div>
  );
}