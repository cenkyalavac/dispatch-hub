// Idempotent recorder for operational failures. Callers pass {type, portal,
// dedup_key, title, description, severity, function_name, external_ref}.
//
// Dedup logic:
//   - Look up OPEN SystemIssue with same (type, portal, dedup_key).
//   - If found → bump occurrence_count + last_seen_at, refresh description.
//     (Window does NOT cap dedup — an open issue stays the SAME issue until
//     it's resolved. A 4-hour-old open poll_failure should still dedup.)
//   - Otherwise → create a new row.
//   - Email throttle: critical issues email only on first creation AND only
//     once per EMAIL_THROTTLE_MIN window (suppresses re-emails when the same
//     issue is resolved + reopens quickly).
//
// This function is invoked from inside try/catch blocks in poll/accept paths.
// Its own failure must NEVER throw — caller already has a bigger problem.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// How recently a critical issue can have been emailed before we suppress a
// re-email on a NEW issue with the same dedup signature. Prevents alert
// fatigue when an outage flaps.
const EMAIL_THROTTLE_MIN = 60;

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

  // Wrap the entire fetch in try/catch — `await fetch().catch()` doesn't
  // suppress rejection from the awaited promise itself (network errors,
  // DNS failure, etc.), only chained handlers. We must not let an email
  // hiccup tear down the issue-recording flow.
  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: recipients,
        subject: `[Dispatch Hub] Critical: ${issue.title}`,
        html,
      }),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      console.error(`recordSystemIssue email HTTP ${resp.status}:`, text.slice(0, 200));
    }
  } catch (e) {
    console.error('recordSystemIssue email failed:', e.message);
  }
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

    // Lookup latest issue with same (type, portal, dedup_key). resolved_at
    // is filtered client-side — entity filter() doesn't reliably match null.
    // Pulling 20 is enough to find the latest open + the latest resolved
    // (needed for email throttling below).
    const candidates = await base44.asServiceRole.entities.SystemIssue
      .filter({ type, portal, dedup_key }, '-last_seen_at', 20)
      .catch(() => []);
    const openIssue = candidates.find((c) => !c.resolved_at);

    if (openIssue) {
      // Open issue stays the same issue. Bump, refresh description.
      const nextCount = (openIssue.occurrence_count || 1) + 1;
      await base44.asServiceRole.entities.SystemIssue.update(openIssue.id, {
        occurrence_count: nextCount,
        last_seen_at: nowIso,
        description,
        // Promote warning→critical if a later occurrence is more severe.
        ...(severity === 'critical' && openIssue.severity !== 'critical' ? { severity: 'critical' } : {}),
      });
      return Response.json({ ok: true, action: 'bumped', issue_id: openIssue.id, occurrences: nextCount });
    }

    // No open issue → create new. Check email throttle: if the same
    // (type, portal, dedup_key) was emailed within EMAIL_THROTTLE_MIN, skip
    // the email but still record the issue.
    const throttleCutoffMs = now.getTime() - EMAIL_THROTTLE_MIN * 60_000;
    const recentlyEmailed = candidates.some(
      (c) => c.emailed_at && new Date(c.emailed_at).getTime() >= throttleCutoffMs
    );

    const created = await base44.asServiceRole.entities.SystemIssue.create({
      type, severity, title, description, portal,
      function_name, external_ref, dedup_key,
      occurrence_count: 1,
      first_seen_at: nowIso,
      last_seen_at: nowIso,
    });

    if (severity === 'critical' && !recentlyEmailed) {
      const baseUrl = Deno.env.get('APP_PUBLIC_URL') || '';
      await sendCriticalEmail({
        base44,
        issue: { ...created, type, severity, title, description, portal, function_name, external_ref },
        baseUrl,
      });
      await base44.asServiceRole.entities.SystemIssue.update(created.id, { emailed_at: nowIso }).catch(() => null);
    }

    return Response.json({
      ok: true,
      action: 'created',
      issue_id: created.id,
      email_throttled: severity === 'critical' && recentlyEmailed,
    });
  } catch (error) {
    console.error('recordSystemIssue error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});