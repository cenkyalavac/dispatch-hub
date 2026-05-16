// Idempotent recorder for operational failures. Callers pass {type, portal,
// dedup_key, title, description, severity, function_name, external_ref}.
//
// Dedup logic:
//   - Look up open SystemIssue with same (type, portal, dedup_key).
//   - If found AND last_seen_at < 30 min ago → bump occurrence_count + last_seen_at.
//   - Otherwise → create a new row, send alert email if severity='critical'.
//
// This function is invoked from inside try/catch blocks in poll/accept paths.
// Its own failure must NEVER throw — caller already has a bigger problem.
//
// Email policy: critical only, once per issue (not once per occurrence). Sent
// to every admin user via Resend.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const DEDUP_WINDOW_MIN = 30;

async function sendCriticalEmail({ base44, issue, baseUrl }) {
  const apiKey = Deno.env.get('RESEND_KEY');
  const from = Deno.env.get('RESEND_FROM');
  if (!apiKey || !from) {
    console.warn('recordSystemIssue: RESEND_KEY/RESEND_FROM missing, skipping email');
    return;
  }

  // Admin lookup uses service role — the caller may have no user context.
  const admins = await base44.asServiceRole.entities.User.filter({ role: 'admin' }).catch(() => []);
  const recipients = admins.map((u) => u.email).filter(Boolean);
  if (recipients.length === 0) {
    console.warn('recordSystemIssue: no admin recipients for critical email');
    return;
  }

  const link = `${baseUrl || ''}/issues`;
  const html = `
    <div style="font-family:system-ui,sans-serif;color:#1a1a1a;max-width:560px">
      <p style="font-size:13px;color:#b00;margin:0 0 8px">⚠️ Critical system issue</p>
      <h2 style="font-size:18px;margin:0 0 12px">${issue.title}</h2>
      <p style="font-size:13px;line-height:1.5;color:#333;white-space:pre-wrap">${escapeHtml(issue.description || '')}</p>
      <table style="margin-top:14px;font-size:12px;border-collapse:collapse">
        <tr><td style="padding:3px 10px 3px 0;color:#666">Portal</td><td>${issue.portal || '—'}</td></tr>
        <tr><td style="padding:3px 10px 3px 0;color:#666">Function</td><td><code>${issue.function_name || '—'}</code></td></tr>
        <tr><td style="padding:3px 10px 3px 0;color:#666">Reference</td><td><code>${issue.external_ref || '—'}</code></td></tr>
        <tr><td style="padding:3px 10px 3px 0;color:#666">Type</td><td>${issue.type}</td></tr>
      </table>
      ${link ? `<p style="margin-top:16px"><a href="${link}" style="background:#2563eb;color:#fff;padding:8px 14px;border-radius:6px;text-decoration:none;font-size:13px">Open Issues</a></p>` : ''}
    </div>
  `;

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: recipients,
      subject: `[Dispatch Hub] Critical: ${issue.title}`,
      html,
    }),
  }).catch((e) => console.error('recordSystemIssue email failed:', e.message));
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const {
      type, portal = '', dedup_key = '',
      title, description = '',
      severity = 'warning',
      function_name = '',
      external_ref = '',
    } = body || {};

    if (!type || !title) {
      return Response.json({ error: 'type and title are required' }, { status: 400 });
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const windowAgo = new Date(now.getTime() - DEDUP_WINDOW_MIN * 60_000).toISOString();

    // Lookup open issue with same (type, portal, dedup_key).
    // resolved_at is filtered client-side because filter() doesn't accept "null" reliably.
    const candidates = await base44.asServiceRole.entities.SystemIssue
      .filter({ type, portal, dedup_key }, '-last_seen_at', 5)
      .catch(() => []);
    const open = candidates.find((c) => !c.resolved_at && c.last_seen_at >= windowAgo);

    if (open) {
      await base44.asServiceRole.entities.SystemIssue.update(open.id, {
        occurrence_count: (open.occurrence_count || 1) + 1,
        last_seen_at: nowIso,
        description, // refresh with latest error text
      });
      return Response.json({ ok: true, action: 'bumped', issue_id: open.id, occurrences: (open.occurrence_count || 1) + 1 });
    }

    const created = await base44.asServiceRole.entities.SystemIssue.create({
      type, severity, title, description, portal,
      function_name, external_ref, dedup_key,
      occurrence_count: 1,
      first_seen_at: nowIso,
      last_seen_at: nowIso,
    });

    if (severity === 'critical') {
      const baseUrl = Deno.env.get('APP_PUBLIC_URL') || '';
      await sendCriticalEmail({
        base44,
        issue: { ...created, type, severity, title, description, portal, function_name, external_ref },
        baseUrl,
      });
      await base44.asServiceRole.entities.SystemIssue.update(created.id, { emailed_at: nowIso }).catch(() => null);
    }

    return Response.json({ ok: true, action: 'created', issue_id: created.id });
  } catch (error) {
    console.error('recordSystemIssue error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});