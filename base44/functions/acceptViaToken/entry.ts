// acceptViaToken
// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC endpoint. Called when a notification recipient clicks the "Accept"
// button in the email. No login required — authority comes from the
// single-use opaque token embedded in the link.
//
// Flow:
//   1. Token arrives via ?token=... query string.
//   2. Look up the matching NotificationDelivery row.
//   3. Bail if it's already been consumed → idempotent (refresh-safe).
//   4. Delegate to the portal-specific accept_function with the original
//      task_payload snapshot (so we don't have to re-fetch the upstream).
//   5. Mark the delivery row consumed_at + clear the token.
//   6. Render a minimal HTML result page (success or failure).
//
// All DB writes use base44.asServiceRole. The original notifyNewTask was the
// auth boundary — the token is the capability that replaces user identity.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const HTML_HEADERS = { 'Content-Type': 'text/html; charset=utf-8' };

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Single shared shell for every response surface (ok / already / error /
// unknown). Keeping it inline avoids a second file — the page is tiny and
// only ever rendered by this function.
function page({ title, headline, body, tone }) {
  const accent = tone === 'success' ? '#16a34a' : tone === 'warn' ? '#d97706' : '#dc2626';
  return `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escapeHtml(title)}</title></head>
<body style="margin:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;">
  <div style="max-width:480px;width:100%;background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:32px;text-align:center;">
    <div style="width:48px;height:48px;border-radius:50%;background:${accent}1a;display:inline-flex;align-items:center;justify-content:center;color:${accent};font-size:24px;font-weight:700;margin-bottom:16px;">
      ${tone === 'success' ? '✓' : tone === 'warn' ? '!' : '×'}
    </div>
    <h1 style="margin:0 0 8px;font-size:20px;color:#111827;font-weight:600;">${escapeHtml(headline)}</h1>
    <div style="color:#6b7280;font-size:14px;line-height:1.55;">${body}</div>
  </div>
</body></html>`;
}

// Map portal key → backend function that accepts a single task. Same fields
// the manual-accept buttons in /pending use, so the payload contract is
// already battle-tested.
const PORTAL_ACCEPT_FN = {
  symfonie:   'symfonieAcceptTask',
  junction:   'junctionAcceptOffer',
  globallink: 'globallinkApproveOne',
};

Deno.serve(async (req) => {
  // Allow GET (clicked from email) and POST (defensive — some mail clients
  // pre-fetch links and we don't want to consume tokens on preview. We keep
  // GET as the canonical path and treat HEAD/OPTIONS as a no-op preview.)
  if (req.method === 'HEAD' || req.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }

  const url = new URL(req.url);
  const token = (url.searchParams.get('token') || '').trim();

  if (!token || token.length < 16) {
    return new Response(
      page({
        title: 'Invalid link', tone: 'error',
        headline: 'This link is invalid',
        body: 'The accept link in your email is missing or malformed. Please open Dispatch Hub directly to accept this task.',
      }),
      { status: 400, headers: HTML_HEADERS }
    );
  }

  const base44 = createClientFromRequest(req);

  // Find the delivery row. We don't probe by token in a separate index — the
  // entity SDK filter is fine at this volume.
  const matches = await base44.asServiceRole.entities.NotificationDelivery
    .filter({ accept_token: token })
    .catch(() => []);

  if (matches.length === 0) {
    // Could be: (a) never existed, (b) already consumed (token cleared).
    // Try to find a recently consumed row with the same token preserved in
    // resend_id-adjacent metadata — but we don't keep that. So show a generic
    // friendly message that covers both cases.
    return new Response(
      page({
        title: 'Link expired', tone: 'warn',
        headline: 'This link has expired or already been used',
        body: 'Each notification link is valid for a single click. If you need to act on this task, please open Dispatch Hub.',
      }),
      { status: 410, headers: HTML_HEADERS }
    );
  }

  const delivery = matches[0];

  // Already consumed → idempotent reload.
  if (delivery.consumed_at) {
    return new Response(
      page({
        title: 'Already accepted', tone: 'success',
        headline: 'This task is already accepted',
        body: `<strong>${escapeHtml(delivery.task_name || delivery.task_id)}</strong> was accepted on ${escapeHtml(new Date(delivery.consumed_at).toLocaleString('en-GB'))}.`,
      }),
      { status: 200, headers: HTML_HEADERS }
    );
  }

  const acceptFn = PORTAL_ACCEPT_FN[delivery.portal];
  if (!acceptFn) {
    await base44.asServiceRole.entities.NotificationDelivery.update(delivery.id, {
      outcome: 'accept_failed',
      error: `No accept function mapped for portal "${delivery.portal}"`,
    }).catch(() => {});
    return new Response(
      page({
        title: 'Unsupported portal', tone: 'error',
        headline: 'Cannot accept from email',
        body: `Portal "${escapeHtml(delivery.portal)}" does not support one-click accept.`,
      }),
      { status: 500, headers: HTML_HEADERS }
    );
  }

  // Replay the original task snapshot to the portal's accept function. The
  // payload shape is the same one the /pending UI uses for manual accepts —
  // EXCEPT GlobalLink, which keys claims by submission_ticket rather than
  // a numeric task_id. We carried submission_ticket through task_payload in
  // globallinkPoll for exactly this hand-off.
  const tp = delivery.task_payload || {};
  let payload;
  if (delivery.portal === 'globallink') {
    payload = {
      submission_ticket: tp.submission_ticket || delivery.task_id.split(':')[0],
    };
  } else {
    payload = {
      task_id: delivery.task_id,
      task_name: tp.task_name || delivery.task_name || '',
      project_name: tp.project_name || '',
      account_name: tp.account_name || tp.client_name || '',
      client_name: tp.client_name || tp.account_name || '',
      source_language: tp.source_language || '',
      target_language: tp.target_language || '',
      word_count: tp.word_count || 0,
      price: tp.price || tp.price_max_usd || 0,
      due_date: tp.due_date || null,
    };
  }

  // Consume the token BEFORE calling the portal accept function. Reason:
  // email pre-fetch / double-click / two-tab scenarios can fire two requests
  // ~200ms apart. With the old order (accept first, consume later), both
  // requests would pass the consumed_at check, both would call the upstream
  // portal, and the second would get a spurious "already accepted" 4xx from
  // Symfonie/Junction. Consuming first means the second request lands on the
  // delivery.consumed_at check above and shows "Already accepted" without
  // touching the portal. The Adim 1 idempotency guards on AcceptedTask +
  // Project provide a second layer of defense for the tiny remaining race
  // window (~50ms) where two requests pass this point simultaneously.
  //
  // outcome stays 'sent' until accept returns — we set it below based on
  // the actual result. If accept throws we DO NOT roll back the token: a
  // second click would just hit the same error, and we don't want to expose
  // the token to retry races.
  const consumedAt = new Date().toISOString();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '';
  await base44.asServiceRole.entities.NotificationDelivery.update(delivery.id, {
    accept_token: null,
    consumed_at: consumedAt,
    consumed_by_ip: ip,
  }).catch(() => {});

  let acceptOk = false, acceptErr = null;
  try {
    // Use regular functions.invoke — asServiceRole.functions.invoke is
    // rejected by the platform's invoke layer with a blanket 403. The
    // public token flow has no end-user identity, but the target accept
    // functions (symfonieAcceptTask, junctionAcceptOffer, globallinkApproveOne)
    // either need their own auth or are gated to allow service callers.
    const r = await base44.functions.invoke(acceptFn, payload);
    if (r?.data?.success) acceptOk = true;
    else acceptErr = r?.data?.error || 'Accept function returned no success flag';
  } catch (e) {
    acceptErr = e.message || String(e);
  }

  // Persist the accept outcome. Token already cleared above — this update
  // only sets outcome + error.
  await base44.asServiceRole.entities.NotificationDelivery.update(delivery.id, {
    outcome: acceptOk ? 'accepted' : 'accept_failed',
    error: acceptOk ? null : acceptErr,
  }).catch(() => {});

  if (acceptOk) {
    return new Response(
      page({
        title: 'Accepted', tone: 'success',
        headline: 'Task accepted',
        body: `<strong>${escapeHtml(delivery.task_name || delivery.task_id)}</strong> was accepted successfully. You can close this tab.`,
      }),
      { status: 200, headers: HTML_HEADERS }
    );
  }

  return new Response(
    page({
      title: 'Accept failed', tone: 'error',
      headline: 'Could not accept this task',
      body: `<p style="margin:0 0 12px;">${escapeHtml(acceptErr || 'Unknown error.')}</p><p style="margin:0;color:#9ca3af;font-size:12px;">Open Dispatch Hub to try again manually.</p>`,
    }),
    { status: 502, headers: HTML_HEADERS }
  );
});