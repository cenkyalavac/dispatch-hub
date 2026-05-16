// Manual recovery: move a stuck project (failed_to_sync OR synchronized) back to 'accepted'
// so the downstream BMS can pick it up again on its next poll. Re-fires project.accepted.
// Admin-only — this is a write that bypasses the normal state machine.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { project_id } = await req.json().catch(() => ({}));
    if (!project_id) return Response.json({ error: 'project_id is required' }, { status: 400 });

    const project = await base44.asServiceRole.entities.Project.get(project_id).catch(() => null);
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

    // Only allow recovery from non-delivered states. Don't let users un-deliver something.
    if (project.state === 'delivered') {
      return Response.json({
        error: `Project is already 'delivered' — cannot reset.`,
      }, { status: 409 });
    }

    await base44.asServiceRole.entities.Project.update(project.id, {
      state: 'accepted',
      sync_error: null,
      acknowledged_at: null,
      acknowledged_by: null,
    });

    // Re-fire project.accepted so any subscribed BMS sees it again. Fire-and-forget.
    // Use regular functions.invoke — asServiceRole.functions.invoke is rejected
    // by the platform's invoke layer with a blanket 403. dispatchWebhook's
    // permissive auth gate accepts admin callers (this endpoint is admin-only).
    base44.functions.invoke('dispatchWebhook', {
      tenant_id: project.tenant_id || 'default',
      event: 'project.accepted',
      project_id: project.id,
    }).catch((e) => console.error('webhook dispatch failed:', e.message));

    console.log(`Project ${project.id} reset to 'accepted' by ${user.email}`);
    return Response.json({ success: true });
  } catch (error) {
    console.error('projectResetSync error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});