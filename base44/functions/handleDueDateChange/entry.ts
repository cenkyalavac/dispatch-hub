// Entity automation handler — invoked when an AcceptedTask is updated.
//
// Compares old vs. new due_date. If it changed:
//   1. Records a UserNotification row (bell icon + Notifications page).
//   2. Updates the linked Project's due_date (so BMS API consumers see the
//      latest value via /api/projects).
//   3. Fires a dispatchWebhook event (project.updated) so any BMS that
//      subscribed will be told in real time.
//   4. Triggers sheetsUpdateTaskRow to overwrite the Due Date cell in the
//      task's row on Google Sheets.
//
// Safe to be a no-op when nothing changed — guarded by changed_fields.
//
// Admin-only: triggered by the platform's entity automation worker,
// which calls as the app owner.

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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json().catch(() => ({}));

    const { event, data, old_data, changed_fields, payload_too_large } = payload;

    if (!event || event.type !== 'update' || event.entity_name !== 'AcceptedTask') {
      return Response.json({ skipped: 'not an AcceptedTask update event' });
    }

    // If payload was too large, re-fetch the entity.
    let current = data;
    if (payload_too_large || !current) {
      current = await base44.asServiceRole.entities.AcceptedTask.get(event.entity_id).catch(() => null);
      if (!current) return Response.json({ error: 'task not found' }, { status: 404 });
    }

    // Bail if due_date didn't actually change.
    const fields = changed_fields || [];
    const dueChanged = fields.includes('due_date') ||
      (old_data && old_data.due_date !== current.due_date);
    if (!dueChanged) {
      return Response.json({ skipped: 'due_date unchanged' });
    }

    const oldDue = old_data?.due_date || '';
    const newDue = current.due_date || '';
    const deltaLabel = oldDue && newDue ? fmtDeltaLabel(oldDue, newDue) : '';

    const taskLabel = current.task_name || `#${current.task_id || event.entity_id}`;
    const portalLabel = current.portal || '';

    // 1. Find the linked Project (if any) by accepted_task_id.
    const projects = await base44.asServiceRole.entities.Project
      .filter({ accepted_task_id: current.id }, '-created_date', 1)
      .catch(() => []);
    const project = projects[0] || null;

    // 2. Create the in-app notification.
    await base44.asServiceRole.entities.UserNotification.create({
      type: 'due_date_changed',
      severity: deltaLabel.includes('earlier') ? 'warning' : 'info',
      title: 'Due date changed',
      body: `${portalLabel ? `[${portalLabel}] ` : ''}${taskLabel} — ${fmtDate(oldDue)} → ${fmtDate(newDue)}${deltaLabel ? ` (${deltaLabel})` : ''}`,
      portal: portalLabel,
      task_id: current.task_id != null ? String(current.task_id) : '',
      accepted_task_id: current.id,
      project_id: project?.id || '',
      old_value: oldDue,
      new_value: newDue,
      delta_label: deltaLabel,
      link_url: `/tasks?id=${current.id}`,
    }).catch((e) => console.error('UserNotification.create failed:', e.message));

    // 3. Update the Project's due_date so BMS API consumers see the new value.
    if (project && project.due_date !== newDue) {
      await base44.asServiceRole.entities.Project
        .update(project.id, { due_date: newDue })
        .catch((e) => console.error('Project.update failed:', e.message));

      // 4. Fire the BMS webhook (project.updated). dispatchWebhook is internal —
      //    call it via the functions API so we get its auth wiring for free.
      await base44.asServiceRole.functions.invoke('dispatchWebhook', {
        tenant_id: project.tenant_id || 'default',
        event: 'project.updated',
        project_id: project.id,
      }).catch((e) => console.error('dispatchWebhook invoke failed:', e.message));
    }

    // 5. Update the Sheets row in place (Due Date column only).
    await base44.asServiceRole.functions.invoke('sheetsUpdateTaskRow', {
      accepted_task_id: current.id,
    }).catch((e) => console.error('sheetsUpdateTaskRow invoke failed:', e.message));

    return Response.json({
      ok: true,
      old_due: oldDue,
      new_due: newDue,
      delta: deltaLabel,
      project_updated: !!project,
    });
  } catch (error) {
    console.error('handleDueDateChange error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});