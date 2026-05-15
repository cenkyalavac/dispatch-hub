// Public /accept page — the landing target for the one-click Accept button
// in notification emails. Pretty URL ("hub.eltur.co/accept?token=…") that
// delegates the actual capability check + side effects to the existing
// `acceptViaToken` backend function. No auth required; the opaque token IS
// the capability.
//
// Why a thin proxy instead of duplicating the logic here:
//   * acceptViaToken already does delivery lookup, idempotent consume,
//     portal accept dispatch, and renders mail-client-friendly HTML.
//   * Keeping a single source of truth means one place to fix bugs, one
//     place that touches NotificationDelivery rows.
//   * The page just embeds the function's HTML response in an iframe so
//     the user sees the rich, branded result page the function already
//     produces — without us re-implementing it in React.
//
// This page lives OUTSIDE the AuthProvider gate (see App.jsx) so the link
// works in an incognito window straight from an email.

import { useEffect, useState } from 'react';

export default function AcceptToken() {
  const [error, setError] = useState(null);
  const [token, setToken] = useState(null);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('token');
    if (!t || t.length < 16) {
      setError('Missing or invalid token. Please use the link from your email.');
      return;
    }
    setToken(t);
  }, []);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-2 px-6">
        <div className="max-w-md w-full bg-surface-1 border border-line-1 rounded-lg p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-danger/10 text-danger inline-flex items-center justify-center text-2xl font-bold mb-4">×</div>
          <h1 className="text-[18px] font-semibold text-ink-1 mb-1.5">Invalid link</h1>
          <p className="text-[13px] text-ink-3 italic-editorial">{error}</p>
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-2 px-6">
        <div className="skel h-3 w-40" />
      </div>
    );
  }

  // Embed the backend function's HTML directly. The function returns a full
  // self-contained page (own <html>/<body>, inline styles) — iframe lets us
  // render it without parsing/re-styling, and keeps the URL bar on /accept.
  return (
    <iframe
      title="Accept task"
      src={`/functions/acceptViaToken?token=${encodeURIComponent(token)}`}
      style={{ width: '100vw', height: '100vh', border: 0, display: 'block' }}
    />
  );
}