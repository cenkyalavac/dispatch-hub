// Entity automation handler — invoked when an AcceptedTask is updated.
//
// When due_date changed:
//   1. Update the linked Project's due_date (so BMS API consumers see it).
//   2. Fire dispatchWebhook (project.updated) to subscribed BMSes.
//   3. Rewrite the Google Sheets row.
//   4. Evaluate all active NotificationSetting rules. For each matching rule,
//      send the configured channels (in_app + email) to the configured
//      recipients. Recipients and channels union across matching rules.
//
// Legacy fallback: when there are zero NotificationSetting rows in the DB at
// all, behave like before — write one in-app row and email every admin. This
// keeps deployments working until someone configures their first rule.
//
// Admin-only: triggered by the platform's entity automation worker.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function fmtDeltaLabel(oldIso, newIso) {
  try {
    const oldMs = new Date(oldIso).getTime();
    const newMs = new Date(newIso).getTime();
    if (Number.isNaN(oldMs) || Number.isNaN(newMs)) return '';
    const diffMs = newMs - oldMs;
    const absMs = Math.abs(diffMs);
    const direction = diffMs < 0 ? 'earlier' : 'later';
    const days = Math.round(absMs / (1000 * 60 * 60 * 24));
    if (days >= 1) return `${days} day${days === 1 ? '' : 's'} ${direction}`;
    const hours = Math.round(absMs / (1000 * 60 * 60));
    if (hours >= 1) return `${hours} hour${hours === 1 ? '' : 's'} ${direction}`;
    const mins = Math.round(absMs / (1000 * 60));
    return `${mins} minute${mins === 1 ? '' : 's'} ${direction}`;
  } catch {
    return '';
  }
}

function fmtDate(iso) {
  if (!iso) return '(unset)';
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

// Mirrors symfonieProcessTasks / junctionProcessOffers operator semantics
// so a NotificationSetting condition behaves exactly like an auto-accept Rule
// condition. Keeps the two evaluators from drifting.
function evalCond(value, operator, target) {
  const s = String(value ?? '').toLowerCase();
  const t = String(target ?? '').toLowerCase();
  const n = Number(value), nt = Number(target);
  switch (operator) {
    case 'contains': return s.includes(t);
    case 'not_contains': return !s.includes(t);
    case 'equals': return s === t;
    case 'starts_with': return s.startsWith(t);
    case 'greater_than': return n > nt;
    case 'less_than': return n < nt;
    case 'greater_equal': return n >= nt;
    case 'less_equal': return n <= nt;
    default: return false;
  }
}

// Gate order: portal scope → only_earlier → min_delta_minutes → AND conditions.
// Anything failing earlier exits cheap; conditions only run when the rule
// already passed the cheaper portal/delta gates.
function matchesSetting(setting, task, oldDue, newDue) {
  const portal = setting.portal || '*';
  if (portal !== '*' && portal !== (task.portal || '')) return false;

  const oldMs = oldDue ? new Date(oldDue).getTime() : null;
  const newMs = newDue ? new Date(newDue).getTime() : null;
  const deltaMs = (oldMs != null && newMs != null) ? (newMs - oldMs) : 0;
  if (setting.only_earlier && deltaMs >= 0) return false;
  const minMs = Math.max(0, Number(setting.min_delta_minutes || 0)) * 60_000;
  if (Math.abs(deltaMs) < minMs) return false;

  const conds = setting.conditions || [];
  if (conds.length === 0) return true;
  return conds.every((c) => evalCond(task[c.field], c.operator, c.value));
}

// Strict {name} substitution — never executes user input. Unknown tokens are
// left as-is so a typo doesn't silently empty the subject.
function renderTokens(template, tokens) {
  return String(template).replace(/\{(\w+)\}/g, (m, k) => tokens[k] ?? m);
}

// Task names and free-text body notes can contain &, <, > — escape so the
// email HTML doesn't break. Cheap intentional escape, not full sanitization.
function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json().catch(() => ({}));

    const { event, data, old_data, changed_fields, payload_too_large } = payload;

    if (!event || event.type !== 'update' || event.entity_name !== 'AcceptedTask') {
      return Response.json({ skipped: 'not an AcceptedTask update event' });
    }

    // If payload was too large or missing, re-fetch the entity.
    let current = data;
    if (payload_too_large || !current) {
      current = await base44.asServiceRole.entities.AcceptedTask.get(event.entity_id).catch(() => null);
      if (!current) return Response.json({ error: 'task not found' }, { status: 404 });
    }

    // Always ensure we have a usable id — the entity automation payload's
    // top-level `data` doesn't always carry the entity id field, so fall back
    // to the event's entity_id (which is always present on update events).
    const taskId = current.id || event.entity_id;

    // Bail if due_date didn't actually change. Compare timestamps when both
    // sides are present so reformatted ISO strings (e.g. trailing zeros) don't
    // produce false positives. `changed_fields` from the trigger is the
    // authoritative signal — the timestamp compare is a defensive fallback
    // for when an admin manually invokes this without changed_fields.
    const fields = changed_fields || [];
    const oldDue = old_data?.due_date || '';
    const newDue = current.due_date || '';
    const sameInstant = oldDue && newDue && new Date(oldDue).getTime() === new Date(newDue).getTime();
    const dueChanged = (fields.includes('due_date') || (old_data && old_data.due_date !== current.due_date)) && !sameInstant;
    if (!dueChanged) {
      return Response.json({ skipped: 'due_date unchanged' });
    }

    const deltaLabel = oldDue && newDue ? fmtDeltaLabel(oldDue, newDue) : '';

    const taskLabel = current.task_name || `#${current.task_id || taskId}`;
    const portalLabel = current.portal || '';

    // 1. Linked Project (if any) — used by Project update + BMS webhook.
    const projects = await base44.asServiceRole.entities.Project
      .filter({ accepted_task_id: taskId }, '-created_date', 1)
      .catch(() => []);
    const project = projects[0] || null;

    // 2. Update Project.due_date so BMS API consumers see the new value.
    //    Timestamp compare so equal-but-differently-formatted ISO strings
    //    don't trigger spurious writes/webhooks.
    let webhookFired = false;
    if (project) {
      const projInstant = project.due_date ? new Date(project.due_date).getTime() : null;
      const newInstant = newDue ? new Date(newDue).getTime() : null;
      if (projInstant !== newInstant) {
        await base44.asServiceRole.entities.Project
          .update(project.id, { due_date: newDue })
          .catch((e) => console.error('Project.update failed:', e.message));

        // 3. Fire BMS webhook. dispatchWebhook is admin-gated internally;
        //    invoke via the regular functions API (NOT asServiceRole) so the
        //    automation worker's caller identity passes through.
        await base44.functions.invoke('dispatchWebhook', {
          tenant_id: project.tenant_id || 'default',
          event: 'project.updated',
          project_id: project.id,
        }).catch((e) => console.error('dispatchWebhook invoke failed:', e.message));
        webhookFired = true;
      }
    }

    // 4. Rewrite the Google Sheets row in place. Independent of Project —
    //    the row belongs to the AcceptedTask, so the spreadsheet always needs
    //    the new value even if no Project is linked.
    await base44.functions.invoke('sheetsUpdateTaskRow', {
      accepted_task_id: taskId,
    }).catch((e) => console.error('sheetsUpdateTaskRow invoke failed:', e.message));

    // 5. Evaluate NotificationSetting rules and dispatch notifications.
    //    Channels and recipients union across all matching rules so a single
    //    fire creates at most one inbox row and at most one email per address.
    const settings = await base44.asServiceRole.entities.NotificationSetting
      .filter({ is_active: true, trigger: 'due_date_changed' }, 'created_date', 200)
      .catch(() => []);
    const matched = settings.filter((s) => matchesSetting(s, current, oldDue, newDue));
    const noRulesConfigured = settings.length === 0;

    // In-app: write a UserNotification when any matched rule includes in_app,
    // OR when no rules are configured at all (legacy default).
    const wantInApp = noRulesConfigured || matched.some((s) => (s.channels || []).includes('in_app'));
    if (wantInApp) {
      await base44.asServiceRole.entities.UserNotification.create({
        type: 'due_date_changed',
        severity: deltaLabel.includes('earlier') ? 'warning' : 'info',
        title: 'Due date changed',
        body: `${portalLabel ? `[${portalLabel}] ` : ''}${taskLabel} — ${fmtDate(oldDue)} → ${fmtDate(newDue)}${deltaLabel ? ` (${deltaLabel})` : ''}`,
        portal: portalLabel,
        task_id: current.task_id != null ? String(current.task_id) : '',
        accepted_task_id: taskId,
        project_id: project?.id || '',
        old_value: oldDue,
        new_value: newDue,
        delta_label: deltaLabel,
        link_url: `/tasks?id=${taskId}`,
      }).catch((e) => console.error('UserNotification.create failed:', e.message));
    }

    // Email: union of recipients from matching rules that include 'email'.
    // First matching rule's overrides win for subject/body — predictable and
    // simpler than e.g. "longest template wins".
    let emailSent = 0;
    let emailRuleNames = [];
    try {
      const resendKey = Deno.env.get('RESEND_KEY');
      const fromAddr = Deno.env.get('RESEND_FROM');
      if (resendKey && fromAddr) {
        const emailRules = matched.filter((s) => (s.channels || []).includes('email'));
        let recipients = [];
        let subjectOverride = '';
        let bodyNote = '';

        if (emailRules.length > 0) {
          emailRuleNames = emailRules.map((r) => r.name);
          const recipSet = new Set();
          // Resolve "admins" token at most once even if multiple rules use it.
          let adminsCache = null;
          const resolveAdmins = async () => {
            if (adminsCache) return adminsCache;
            const rows = await base44.asServiceRole.entities.User
              .filter({ role: 'admin' }, '-created_date', 100)
              .catch(() => []);
            adminsCache = rows.map((u) => u.email).filter(Boolean);
            return adminsCache;
          };
          for (const rule of emailRules) {
            for (const r of rule.recipients || []) {
              if (r === 'admins') {
                (await resolveAdmins()).forEach((e) => recipSet.add(e));
              } else if (r) {
                recipSet.add(r);
              }
            }
            if (!subjectOverride && rule.email_subject_template) subjectOverride = rule.email_subject_template;
            if (!bodyNote && rule.email_body_note) bodyNote = rule.email_body_note;
          }
          recipients = [...recipSet];
        } else if (noRulesConfigured) {
          const admins = await base44.asServiceRole.entities.User
            .filter({ role: 'admin' }, '-created_date', 100)
            .catch(() => []);
          recipients = admins.map((u) => u.email).filter(Boolean);
          emailRuleNames = ['(default: all admins)'];
        }

        if (recipients.length > 0) {
          const isEarlier = deltaLabel.includes('earlier');
          const tokens = {
            task_name: taskLabel,
            portal: portalLabel || 'task',
            project_name: current.project_name || '',
            client_name: current.client_name || '',
            delta: deltaLabel || '',
            direction: isEarlier ? 'earlier' : 'later',
          };
          const subject = subjectOverride
            ? renderTokens(subjectOverride, tokens)
            : `[${portalLabel || 'task'}] Due date ${isEarlier ? 'moved earlier' : 'changed'}: ${taskLabel}`;
          const appUrl = Deno.env.get('APP_PUBLIC_URL') || '';
          const link = appUrl ? `${appUrl}/tasks?id=${taskId}` : '';
          const html = `
            <div style="font-family:-apple-system,Segoe UI,sans-serif;color:#1a1a1a;line-height:1.5;max-width:560px">
              <h2 style="margin:0 0 8px;font-size:18px;font-weight:600">Due date ${isEarlier ? 'moved earlier' : 'changed'}</h2>
              <p style="margin:0 0 16px;color:#555;font-size:14px">
                ${portalLabel ? `<strong>[${escapeHtml(portalLabel)}]</strong> ` : ''}${escapeHtml(taskLabel)}
              </p>
              ${bodyNote ? `<p style="margin:0 0 16px;padding:10px 12px;background:#fff7ed;border-left:3px solid #f59e0b;font-size:13px;color:#92400e">${escapeHtml(bodyNote)}</p>` : ''}
              <table style="border-collapse:collapse;font-size:14px;margin:0 0 16px">
                <tr><td style="padding:4px 12px 4px 0;color:#777">Previous</td><td style="padding:4px 0">${fmtDate(oldDue)}</td></tr>
                <tr><td style="padding:4px 12px 4px 0;color:#777">New</td><td style="padding:4px 0;font-weight:600">${fmtDate(newDue)}</td></tr>
                ${deltaLabel ? `<tr><td style="padding:4px 12px 4px 0;color:#777">Delta</td><td style="padding:4px 0;color:${isEarlier ? '#b45309' : '#555'}">${deltaLabel}</td></tr>` : ''}
              </table>
              ${link ? `<p style="margin:0"><a href="${link}" style="display:inline-block;padding:8px 14px;background:#1a1a1a;color:#fff;border-radius:6px;text-decoration:none;font-size:13px">Open task</a></p>` : ''}
              <p style="margin:24px 0 0;color:#999;font-size:12px">Automatic notification from Dispatch Hub.</p>
            </div>`;
          const r = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${resendKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ from: fromAddr, to: recipients, subject, html }),
          });
          if (r.ok) emailSent = recipients.length;
          else console.error('Resend send failed:', r.status, (await r.text()).slice(0, 200));
        }
      }
    } catch (e) {
      console.error('email notify failed:', e.message);
    }

    return Response.json({
      ok: true,
      old_due: oldDue,
      new_due: newDue,
      delta: deltaLabel,
      project_linked: !!project,
      webhook_fired: webhookFired,
      email_sent_to: emailSent,
      matched_rules: matched.map((m) => m.name),
      email_rules: emailRuleNames,
      in_app_written: wantInApp,
    });
  } catch (error) {
    console.error('handleDueDateChange error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});