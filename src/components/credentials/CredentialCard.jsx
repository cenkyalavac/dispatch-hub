import { useState } from 'react';
import { KeyRound, RotateCw, ShieldCheck, Mail, Smartphone, X, Send } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import SessionStatusBadge from './SessionStatusBadge';

const EM = '—';

function Field({ label, value, mono }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-ink-3 font-medium">{label}</div>
      <div className={`text-[13px] text-ink-1 mt-0.5 break-words ${mono ? 'font-mono' : ''}`}>{value || EM}</div>
    </div>
  );
}

const MFA_ICON = { email: Mail, sms: Smartphone };

export default function CredentialCard({ cred, onChanged }) {
  const [showPwField, setShowPwField] = useState(false);
  const [newPw, setNewPw] = useState('');
  const [smsInput, setSmsInput] = useState('');
  const [busy, setBusy] = useState(false);

  const MfaIcon = MFA_ICON[cred.mfaType];

  const savePassword = async () => {
    if (!newPw.trim()) return;
    setBusy(true);
    try {
      await base44.entities.ConnectorCredential.update(cred.id, {
        password: newPw,
        sessionStatus: 'needs_login',
        reauthState: 'requested',
        reauthRequestedAt: new Date().toISOString(),
      });
      setNewPw('');
      setShowPwField(false);
      toast.success(
        cred.mfaType === 'sms' || cred.mfaType === 'email'
          ? 'Password saved — broker is logging in, the code prompt will appear shortly'
          : 'Password saved — broker will re-login'
      );
      onChanged?.();
    } catch (e) {
      toast.error('Could not save', { description: e.message });
    } finally {
      setBusy(false);
    }
  };

  const reauthenticate = async () => {
    setBusy(true);
    try {
      await base44.entities.ConnectorCredential.update(cred.id, {
        sessionStatus: 'needs_login',
        reauthState: 'requested',
        reauthRequestedAt: new Date().toISOString(),
      });
      toast.success('Re-authentication requested');
      onChanged?.();
    } catch (e) {
      toast.error('Could not request re-auth', { description: e.message });
    } finally {
      setBusy(false);
    }
  };

  const submitSms = async () => {
    if (!smsInput.trim()) return;
    setBusy(true);
    try {
      await base44.entities.ConnectorCredential.update(cred.id, {
        smsCode: smsInput,
        reauthState: 'submitting',
      });
      setSmsInput('');
      toast.success('Code submitted');
      onChanged?.();
    } catch (e) {
      toast.error('Could not submit code', { description: e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-surface-1 border border-line-1 rounded-md p-5">
      <div className="flex items-start gap-3 mb-4">
        <div className="min-w-0 flex-1">
          <h3 className="text-[14px] font-semibold text-ink-1 truncate">{cred.label}</h3>
          <div className="text-[12px] text-ink-3 font-mono mt-0.5">{cred.accountKey}</div>
        </div>
        <SessionStatusBadge status={cred.sessionStatus} />
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-3 mb-4">
        <Field label="Login" value={cred.login} mono />
        <Field label="Password" value="••••••••" mono />
        <div>
          <div className="text-[10px] uppercase tracking-wider text-ink-3 font-medium">MFA</div>
          <div className="text-[13px] text-ink-1 mt-0.5 inline-flex items-center gap-1.5">
            {MfaIcon && <MfaIcon className="w-3.5 h-3.5 text-ink-3" />}
            {cred.mfaType || 'none'}
            {cred.mfaType === 'email' && cred.mfaMailbox && (
              <span className="text-ink-3 font-mono text-[12px]">· {cred.mfaMailbox}</span>
            )}
          </div>
        </div>
        <Field label="Last login" value={cred.lastLoginAt} />
      </div>

      {cred.statusMessage && (
        <p className="text-[12px] text-ink-2 italic-editorial border-l-2 border-line-2 pl-3 mb-4">
          {cred.statusMessage}
        </p>
      )}

      {/* Logging in — broker is authenticating; for MFA accounts the code prompt
          appears once the portal challenges. Shown while we wait for the broker. */}
      {cred.sessionStatus !== 'awaiting_sms' &&
        (cred.reauthState === 'requested' || cred.sessionStatus === 'logging_in') &&
        (cred.mfaType === 'sms' || cred.mfaType === 'email') && (
        <div className="bg-surface-2 border border-line-1 rounded-md p-3 mb-4">
          <div className="text-[12px] text-ink-2 inline-flex items-center gap-2">
            <RotateCw className="w-3.5 h-3.5 animate-spin text-ink-3" />
            Broker is logging in — the {cred.mfaType === 'sms' ? 'SMS' : 'email'} code prompt will appear here once the portal asks for it.
          </div>
        </div>
      )}

      {/* Awaiting SMS — prominent OTP entry */}
      {cred.sessionStatus === 'awaiting_sms' && (
        <div className="bg-warning-soft border border-warning/30 rounded-md p-3 mb-4">
          <div className="text-[12px] font-semibold text-ink-1 mb-2 inline-flex items-center gap-1.5">
            <Smartphone className="w-3.5 h-3.5" /> Enter SMS code
          </div>
          <div className="flex items-center gap-2">
            <input
              value={smsInput}
              onChange={(e) => setSmsInput(e.target.value)}
              placeholder="123456"
              inputMode="numeric"
              autoComplete="one-time-code"
              className="field-control flex-1 h-9 px-3 rounded-md border border-line-1 bg-surface-1 text-[13px] font-mono tracking-widest outline-none placeholder:text-ink-4"
            />
            <button
              onClick={submitSms}
              disabled={busy || !smsInput.trim()}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-accent text-white text-[13px] font-medium hover:bg-[var(--accent-hover)] transition-colors duration-tab disabled:opacity-40"
            >
              <Send className="w-3.5 h-3.5" /> Submit code
            </button>
          </div>
        </div>
      )}

      {/* Update password field */}
      {showPwField && (
        <div className="bg-surface-2 border border-line-1 rounded-md p-3 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12px] font-semibold text-ink-1">New password</span>
            <button onClick={() => { setShowPwField(false); setNewPw(''); }} className="text-ink-3 hover:text-ink-1">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              placeholder="Enter new password"
              autoComplete="new-password"
              className="field-control flex-1 h-9 px-3 rounded-md border border-line-1 bg-surface-1 text-[13px] outline-none placeholder:text-ink-4"
            />
            <button
              onClick={savePassword}
              disabled={busy || !newPw.trim()}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-accent text-white text-[13px] font-medium hover:bg-[var(--accent-hover)] transition-colors duration-tab disabled:opacity-40"
            >
              <ShieldCheck className="w-3.5 h-3.5" /> Save & re-login
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {!showPwField && (
          <button
            onClick={() => setShowPwField(true)}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-line-1 bg-surface-1 text-[13px] text-ink-2 hover:bg-surface-2 transition-colors duration-tab"
          >
            <KeyRound className="w-3.5 h-3.5" /> Update password
          </button>
        )}
        <button
          onClick={reauthenticate}
          disabled={busy}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-line-1 bg-surface-1 text-[13px] text-ink-2 hover:bg-surface-2 transition-colors duration-tab disabled:opacity-40"
        >
          <RotateCw className="w-3.5 h-3.5" /> Re-authenticate
        </button>
      </div>
    </div>
  );
}