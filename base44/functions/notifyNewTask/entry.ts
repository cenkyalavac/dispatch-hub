// notifyNewTask
// ─────────────────────────────────────────────────────────────────────────────
// Sends a Resend-powered email for a single incoming task that did NOT match
// any auto-accept Rule. Called fire-and-forget from the three process
// functions (symfonieProcessTasks, junctionProcessOffers, globallinkPoll).
//
// Inputs (POST JSON):
//   portal:         'symfonie' | 'junction' | 'globallink'
//   task_id:        provider task id as string (we coerce everything to string
//                   so Symfonie's integers and GlobalLink's tickets share one
//                   key space)
//   task_payload:   snapshot of the task — task_name, project_name, client_name,
//                   source_language, target_language, word_count, price,
//                   due_date, workflow_name. Whatever the caller has handy.
//                   Used for (1) condition matching, (2) email body, and
//                   (3) replaying the upstream accept call when the user
//                   clicks the Accept button.
//
// Behaviour:
//   1. Loads active NotificationRule rows for portal=incoming OR portal='*'.
//   2. Evaluates AND-combined conditions per rule.
//   3. For every matching rule × recipient pair:
//        - Skip if a NotificationDelivery row already exists (idempotent).
//        - Mint a single-use accept_token.
//        - Send Resend email with one-click Accept link.
//        - Log NotificationDelivery row.
//
// Authentication: ADMIN ONLY. Called only by other backend functions (service
// role) or scheduled tasks. End users never hit this directly.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const RESEND_API = 'https://api.resend.com/emails';

// Default sender — Resend's onboarding sandbox is safe out of the box.
// Override per app via the RESEND_FROM secret once a verified domain is set up.
const FROM_DEFAULT = 'Dispatch Hub <onboarding@resend.dev>';

function evaluateCondition(value, operator, target) {
  const s = String(value ?? '').toLowerCase();
  const t = String(target ?? '').toLowerCase();
  const n = Number(value), nt = Number(target);
  switch (operator) {
    case 'contains':       return s.includes(t);
    case 'not_contains':   return !s.includes(t);
    case 'equals':         return s === t;
    case 'starts_with':    return s.startsWith(t);
    case 'greater_than':   return n > nt;
    case 'less_than':      return n < nt;
    case 'greater_equal':  return n >= nt;
    case 'less_equal':     return n <= nt;
    default: return false;
  }
}

function ruleMatches(rule, task) {
  // Empty conditions array = catch-all on this portal.
  if (!Array.isArray(rule.conditions) || rule.conditions.length === 0) return true;
  return rule.conditions.every((c) => evaluateCondition(task[c.field], c.operator, c.value));
}

// Crypto-strong opaque token. 32 bytes → 64 hex chars. Single-use; we clear
// `accept_token` on the delivery row once consumed.
function mintToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function fmtNum(n) {
  if (n == null || n === '') return '—';
  return Number(n).toLocaleString('en-US');
}
function fmtMoney(n) {
  if (!n || Number(n) === 0) return '—';
  return '$' + Number(n).toFixed(2);
}
function fmtDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }); }
  catch { return iso; }
}
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Leverage band definitions — same order/labels the in-app SymfonieTaskDetail
// uses. For GlobalLink we sum the "pure fuzzy" band with its sibling "Reps
// in that band" because that's how the WWC formula treats them and that's
// the number recipients actually need to price the job.
const LEVERAGE_BANDS = [
  { key: 'lev_context',  label: 'Context',     repKey: null },
  { key: 'lev_rep',      label: 'Repetitions', repKey: null },
  { key: 'lev_match100', label: '100%',        repKey: null },
  { key: 'lev_9599',     label: '95–99%',      repKey: 'lev_rep_9599' },
  { key: 'lev_8594',     label: '85–94%',      repKey: 'lev_rep_8594' },
  { key: 'lev_7584',     label: '75–84%',      repKey: 'lev_rep_7584' },
  { key: 'lev_5074',     label: '50–74%',      repKey: 'lev_rep_5074' },
  { key: 'lev_no_match', label: 'No match',    repKey: null },
];

// Returns the leverage-grid HTML when the task carries ANY non-zero leverage
// value — otherwise returns '' so the section is omitted entirely.
function buildLeverageGrid(task) {
  const values = LEVERAGE_BANDS.map(({ key, label, repKey }) => {
    const base = Number(task[key]) || 0;
    const rep = repKey ? (Number(task[repKey]) || 0) : 0;
    return { label, value: base + rep };
  });
  const total = values.reduce((s, v) => s + v.value, 0);
  if (total === 0) return '';

  // 4-column grid built with nested tables — Outlook can't handle CSS grid.
  // Two rows of four cells each. Each cell shows label + count + share%.
  const cell = (v) => {
    const pct = total > 0 ? (v.value / total) * 100 : 0;
    return `<td width="25%" style="padding:6px;vertical-align:top;">
      <div style="background:#f9fafb;border:1px solid #f3f4f6;border-radius:6px;padding:8px 10px;">
        <p style="margin:0;color:#9ca3af;font-size:10px;text-transform:uppercase;letter-spacing:.06em;">${esc(v.label)}</p>
        <p style="margin:2px 0 0;color:#111827;font-size:14px;font-weight:600;font-variant-numeric:tabular-nums;">${fmtNum(v.value)}</p>
        <p style="margin:0;color:#9ca3af;font-size:10px;font-variant-numeric:tabular-nums;">${pct.toFixed(0)}%</p>
      </div>
    </td>`;
  };
  const row1 = values.slice(0, 4).map(cell).join('');
  const row2 = values.slice(4, 8).map(cell).join('');

  const wwc = Number(task.weighted_wc) || 0;
  const wwcLine = wwc > 0
    ? `<p style="margin:8px 12px 0;color:#6b7280;font-size:11px;">
         Weighted WC: <strong style="color:#111827;font-variant-numeric:tabular-nums;">${fmtNum(Math.round(wwc))}</strong>
         · Total: <strong style="color:#111827;font-variant-numeric:tabular-nums;">${fmtNum(total)}</strong>
       </p>`
    : '';
  const parserLine = task.parser_type
    ? `<p style="margin:0 12px 0;color:#9ca3af;font-size:10px;text-transform:uppercase;letter-spacing:.06em;">Analysis · ${esc(task.parser_type)}</p>`
    : '';

  return `
    <tr><td style="padding:4px 16px 0;">
      <p style="margin:12px 12px 6px;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:.08em;font-weight:600;">Word-count analysis</p>
      ${parserLine}
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;">
        <tr>${row1}</tr>
        <tr>${row2}</tr>
      </table>
      ${wwcLine}
    </td></tr>`;
}

// Pulls a small set of optional metadata rows. Only the ones present on the
// payload are returned — keeps the mail compact for portals (Junction) that
// don't send them.
function buildExtraRows(task) {
  const extra = [];
  if (Array.isArray(task.requestors) && task.requestors.length > 0) {
    extra.push(['Requestors', task.requestors.join(', ')]);
  }
  if (Array.isArray(task.assignees) && task.assignees.length > 0) {
    extra.push(['Assignees', task.assignees.join(', ')]);
  }
  if (task.phase_name) extra.push(['Phase', task.phase_name]);
  if (task.submission_id) extra.push(['Submission', task.submission_id]);
  if (task.symfonie_code) extra.push(['Symfonie code', task.symfonie_code]);
  if (task.job_identifier) extra.push(['Job', task.job_identifier]);
  return extra;
}

// Custom fields come back from Symfonie as a flat object. Filter empties and
// keep at most 6 — recipients don't need a wall of metadata in their inbox.
function buildCustomFieldRows(task) {
  const cf = task.custom_fields;
  if (!cf || typeof cf !== 'object') return [];
  return Object.entries(cf)
    .filter(([, v]) => v != null && v !== '')
    .slice(0, 6)
    .map(([k, v]) => [k, String(v)]);
}

// Compact, mail-client-safe HTML. Inline styles only — Gmail/Outlook strip
// <style> blocks. No external CSS, no web fonts.
function buildEmail({ portal, task, acceptUrl, rule }) {
  const portalLabel = ({ symfonie: 'Symfonie', junction: 'Junction', globallink: 'GlobalLink' })[portal] || portal;

  // Friendly-or-raw helper. When a rumuz exists and differs from the raw
  // value, we render "Friendly (raw)" so recipients see both. Otherwise just
  // the value.
  const fr = (friendly, raw) => {
    if (!friendly || friendly === raw) return raw || '';
    if (!raw) return friendly;
    return `${friendly} (${raw})`;
  };

  const projectLine = fr(task.friendly_project_name, task.project_name);
  const clientLine = fr(task.friendly_client_name, task.client_name)
    || fr(task.friendly_account_name, task.account_name);
  const workflowLine = fr(task.friendly_workflow_name, task.workflow_name);

  const baseRows = [
    ['Task',       task.task_name],
    ['Project',    projectLine],
    ['Client',     clientLine],
    ['Languages',  [task.source_language, task.target_language].filter(Boolean).join(' → ')],
    ['Word count', fmtNum(task.word_count)],
    ['Price',      fmtMoney(task.price)],
    ['Due',        fmtDate(task.due_date)],
    ['Workflow',   workflowLine],
  ];
  const rows = [...baseRows, ...buildExtraRows(task), ...buildCustomFieldRows(task)]
    .filter(([, v]) => v && v !== '—');

  const rowsHtml = rows.map(([k, v]) => `
    <tr>
      <td style="padding:8px 12px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:.04em;white-space:nowrap;border-bottom:1px solid #f3f4f6;vertical-align:top;">${esc(k)}</td>
      <td style="padding:8px 12px;color:#111827;font-size:14px;border-bottom:1px solid #f3f4f6;">${esc(v)}</td>
    </tr>`).join('');

  const leverageHtml = buildLeverageGrid(task);

  return `<!doctype html>
<html><body style="margin:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f9fafb;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
        <tr><td style="padding:24px 28px 8px;">
          <p style="margin:0;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:.08em;">New task — ${esc(portalLabel)}</p>
          <h1 style="margin:6px 0 0;color:#111827;font-size:20px;font-weight:600;line-height:1.3;">${esc(task.task_name || 'Untitled task')}</h1>
        </td></tr>
        <tr><td style="padding:12px 16px 8px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">${rowsHtml}</table>
        </td></tr>
        ${leverageHtml}
        <tr><td align="center" style="padding:20px 28px 28px;">
          <a href="${esc(acceptUrl)}"
             style="display:inline-block;padding:12px 28px;background:#4f46e5;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;border-radius:8px;">
            Accept this task
          </a>
          <p style="margin:14px 0 0;color:#9ca3af;font-size:11px;">One click. No login required. Single-use link.</p>
        </td></tr>
        <tr><td style="padding:14px 28px;background:#f9fafb;border-top:1px solid #f3f4f6;">
          <p style="margin:0;color:#9ca3af;font-size:11px;">Notification rule: <strong style="color:#6b7280;">${esc(rule.name)}</strong></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    // Soft auth: allow admin users + service-role callers (asServiceRole.functions.invoke
    // surfaces a synthetic 'service+...' user with role!='admin' — treat it as elevated).
    // Reject anonymous app users only.
    const isService = !user || (typeof user.email === 'string' && user.email.startsWith('service+'));
    if (!isService && user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const apiKey = Deno.env.get('RESEND_KEY');
    if (!apiKey) {
      return Response.json({ success: false, error: 'RESEND_KEY not configured' }, { status: 503 });
    }
    const from = Deno.env.get('RESEND_FROM') || FROM_DEFAULT;

    const body = await req.json().catch(() => ({}));
    const { portal, task_id, task_payload } = body || {};
    if (!portal || task_id == null || !task_payload) {
      return Response.json({ success: false, error: 'portal, task_id, task_payload required' }, { status: 400 });
    }
    const taskIdStr = String(task_id);

    // Load matching rules (portal-specific + wildcard '*').
    const [portalRules, wildcardRules] = await Promise.all([
      base44.asServiceRole.entities.NotificationRule.filter({ portal, is_active: true }, 'priority', 100),
      base44.asServiceRole.entities.NotificationRule.filter({ portal: '*', is_active: true }, 'priority', 100),
    ]);
    const rules = [...portalRules, ...wildcardRules];
    if (rules.length === 0) {
      return Response.json({ success: true, skipped: true, reason: 'No notification rules' });
    }

    // Resolve friendly names for the task once. Mail body and the task copy
    // we hand off to evaluateCondition both benefit — rules written against
    // the friendly_* fields can target rumuz instead of the verbose upstream
    // names. Unmatched values fall through to the raw value.
    const friendlyRows = await base44.asServiceRole.entities.FriendlyName.list('-created_date', 2000).catch(() => []);
    const friendlyLookup = (type, taskObj) => {
      const fieldsByType = {
        client:   { nameField: 'client_name',   idField: null },
        account:  { nameField: 'account_name',  idField: 'account_id' },
        project:  { nameField: 'project_name',  idField: 'project_id' },
        workflow: { nameField: 'workflow_name', idField: null },
      };
      const f = fieldsByType[type];
      if (!f) return '';
      const rawName = taskObj[f.nameField] != null ? String(taskObj[f.nameField]) : '';
      const rawId = f.idField && taskObj[f.idField] != null ? String(taskObj[f.idField]) : '';
      const candidates = friendlyRows
        .filter((r) => r.is_active !== false && r.type === type && (r.portal === portal || r.portal === '*'))
        .sort((a, b) => (a.portal === '*' ? 1 : 0) - (b.portal === '*' ? 1 : 0));
      for (const r of candidates) {
        const match_by = r.match_by || 'name';
        const srcLc = String(r.source_value || '').toLowerCase();
        if (match_by === 'id' && rawId && srcLc === rawId.toLowerCase()) return r.display_name;
        if (match_by === 'name' && rawName && srcLc === rawName.toLowerCase()) return r.display_name;
      }
      return rawName;
    };
    const taskWithFriendly = {
      ...task_payload,
      friendly_client_name:   friendlyLookup('client',   task_payload),
      friendly_account_name:  friendlyLookup('account',  task_payload),
      friendly_project_name:  friendlyLookup('project',  task_payload),
      friendly_workflow_name: friendlyLookup('workflow', task_payload),
    };

    // Already-sent rows for this task → idempotency lookup. Only `outcome:'sent'`
    // counts as "delivered" — failed sends (rate-limit, transient SMTP) should be
    // retryable on the next process run, otherwise Resend 429 bursts permanently
    // suppress mails for whichever tasks happened to land in the over-quota slice.
    const existing = await base44.asServiceRole.entities.NotificationDelivery
      .filter({ portal, task_id: taskIdStr })
      .catch(() => []);
    const alreadySentKey = new Set(
      existing.filter((d) => d.outcome === 'sent').map((d) => `${d.rule_id}::${d.recipient}`)
    );

    // Build the base for the Accept link. APP_PUBLIC_URL is the canonical
    // public landing page for one-click accepts (e.g. https://hub.eltur.co/accept).
    // When it's set we use it verbatim and just append ?token=…; when it's
    // not, we fall back to the request's own origin plus the /accept route
    // served by the SPA.
    const reqUrl = new URL(req.url);
    const acceptBase = Deno.env.get('APP_PUBLIC_URL') || `${reqUrl.protocol}//${reqUrl.host}/accept`;

    const results = { sent: 0, skipped: 0, errors: 0, deliveries: [] };

    // Resend's free tier caps at 5 requests/second. When symfonieProcessTasks
    // notifies several unmatched tasks back-to-back (or a rule has multiple
    // recipients), bursts easily exceed that and a slice of the mails comes
    // back as 429 'rate_limit_exceeded'. We pace ourselves at ~4 req/sec
    // (250ms gap) which keeps a comfortable margin under the limit.
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    let isFirstSend = true;

    for (const rule of rules) {
      // Rules can target friendly_* fields too — pass the enriched payload.
      if (!ruleMatches(rule, taskWithFriendly)) continue;
      const recipients = Array.isArray(rule.recipients) ? rule.recipients.filter(Boolean) : [];
      if (recipients.length === 0) continue;

      for (const recipient of recipients) {
        const dedupeKey = `${rule.id}::${recipient}`;
        if (alreadySentKey.has(dedupeKey)) { results.skipped++; continue; }

        // Pace successive Resend calls. First send fires immediately; every
        // subsequent send waits 250ms so we stay under the 5 req/sec ceiling.
        if (!isFirstSend) await sleep(250);
        isFirstSend = false;

        const token = mintToken();
        // Pretty public URL — APP_PUBLIC_URL already points at the SPA's
        // /accept page which proxies to acceptViaToken under the hood.
        const acceptUrl = `${acceptBase}?token=${token}`;

        const html = buildEmail({ portal, task: taskWithFriendly, acceptUrl, rule });
        const subject = `New ${({ symfonie: 'Symfonie', junction: 'Junction', globallink: 'GlobalLink' })[portal] || portal} task — ${task_payload.task_name || taskIdStr}`;

        // On a 429, back off 1.2s and retry once. That's enough to clear the
        // 1-second rolling window Resend's free tier uses. Other errors are
        // not retried — they're either auth / payload bugs (won't fix by
        // waiting) or temporary upstream issues we'd rather surface fast.
        let resendId = null, sendError = null;
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const r = await fetch(RESEND_API, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ from, to: [recipient], subject, html }),
            });
            const text = await r.text();
            if (r.ok) {
              try { resendId = JSON.parse(text).id || null; } catch { /* keep null */ }
              sendError = null;
              break;
            }
            sendError = `Resend ${r.status}: ${text.slice(0, 200)}`;
            if (r.status === 429 && attempt === 0) { await sleep(1200); continue; }
            break;
          } catch (e) {
            sendError = e.message;
            break;
          }
        }
        if (sendError) results.errors++; else results.sent++;

        try {
          const row = await base44.asServiceRole.entities.NotificationDelivery.create({
            portal,
            task_id: taskIdStr,
            task_name: task_payload.task_name || '',
            rule_id: rule.id,
            rule_name: rule.name,
            recipient,
            sent_at: new Date().toISOString(),
            resend_id: resendId,
            accept_token: sendError ? null : token,
            outcome: sendError ? 'send_failed' : 'sent',
            error: sendError,
            task_payload,
          });
          results.deliveries.push({ id: row.id, recipient, ok: !sendError });
        } catch (e) {
          console.error('NotificationDelivery insert failed:', e.message);
          results.errors++;
        }
      }
    }

    return Response.json({ success: true, ...results });
  } catch (error) {
    console.error('notifyNewTask error:', error.message);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});