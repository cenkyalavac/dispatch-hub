// base44/functions/connectorBrokerSync/entry.ts
// Broker-callable bidirectional sync for the Connector Credentials control surface.
//
// An external broker polls this once per account it manages. In one round-trip it:
//   (1) reports its current state (sessionStatus / reauthState / statusMessage / lastLoginAt),
//   (2) pulls the credentials + UI-driven control fields it needs to (re)login:
//       login, password, mfaType, mfaMailbox, reauthState, smsCode.
//
// The handshake (who sets what):
//   UI     -> password (on update), reauthState='requested' + sessionStatus='needs_login'
//             (on "Re-authenticate"/password change), smsCode + reauthState='submitting'
//             (on SMS submit).
//   Broker -> sessionStatus='logging_in' when it starts; 'awaiting_sms' + reauthState='awaiting_sms'
//             when blocked on an SMS code; 'connected' + reauthState='done' + lastLoginAt + clearSmsCode
//             on success; 'error' + reauthState='failed' + statusMessage on failure.
//
// Auth: shared secret header X-Broker-Key must match BROKER_KEY env var.
// password and smsCode are returned ONLY to the authenticated broker, never to the UI.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const SESSION_STATUS = ['connected', 'needs_login', 'logging_in', 'awaiting_sms', 'error'];
const REAUTH_STATE = ['idle', 'requested', 'awaiting_sms', 'submitting', 'done', 'failed'];

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    const expected = Deno.env.get('BROKER_KEY');
    const got = req.headers.get('x-broker-key');
    if (!expected || !got || got !== expected) {
      return Response.json({ error: 'invalid broker key' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { accountKey, sessionStatus, statusMessage, lastLoginAt, reauthState, clearSmsCode } = body || {};
    if (!accountKey) {
      return Response.json({ error: 'accountKey required' }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);
    const rows = await base44.asServiceRole.entities.ConnectorCredential.filter({ accountKey });
    if (!rows || rows.length === 0) {
      // No credential row for this account yet — the admin must create it in the UI first.
      // Return found:false so the broker skips rather than error-spamming.
      return Response.json({ ok: true, found: false, accountKey });
    }
    const row = rows[0];

    // Persist whatever state the broker reported (only present + enum-valid fields).
    const patch = {};
    if (typeof sessionStatus === 'string' && SESSION_STATUS.includes(sessionStatus)) patch.sessionStatus = sessionStatus;
    if (typeof reauthState === 'string' && REAUTH_STATE.includes(reauthState)) patch.reauthState = reauthState;
    if (typeof statusMessage === 'string') patch.statusMessage = statusMessage.slice(0, 2000);
    if (typeof lastLoginAt === 'string') patch.lastLoginAt = lastLoginAt;
    if (clearSmsCode === true) patch.smsCode = '';
    if (Object.keys(patch).length) {
      await base44.asServiceRole.entities.ConnectorCredential.update(row.id, patch);
    }

    const merged = { ...row, ...patch };
    return Response.json({
      ok: true,
      found: true,
      accountKey,
      connector: merged.connector || '',
      login: merged.login || '',
      password: merged.password || '',
      mfaType: merged.mfaType || 'none',
      mfaMailbox: merged.mfaMailbox || '',
      sessionStatus: merged.sessionStatus || 'needs_login',
      reauthState: merged.reauthState || 'idle',
      smsCode: merged.smsCode || '',
      reauthRequestedAt: merged.reauthRequestedAt || '',
    });
  } catch (error) {
    console.error('[connectorBrokerSync] error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
