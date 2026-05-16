// BMS confirms it has pulled the project. Transitions state: accepted -> synchronized.
// Body: { id: string }
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function parseApiKey(req) {
  const h = req.headers.get('authorization') || req.headers.get('Authorization') || '';
  const m = h.match(/^(?:Apikey|Bearer)\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

async function authenticateKey(base44, token, scopeNeeded) {
  if (!token) return { error: 'Missing Authorization header (Apikey <token>)', status: 401 };
  const matches = await base44.asServiceRole.entities.ApiKey.filter({ token });
  const key = matches?.[0];
  if (!key) return { error: 'Invalid API key', status: 401 };
  if (key.revoked_at) return { error: 'API key has been revoked', status: 403 };
  if (scopeNeeded && Array.isArray(key.scopes) && !key.scopes.includes(scopeNeeded)) {
    return { error: `API key missing scope: ${scopeNeeded}`, status: 403 };
  }
  base44.asServiceRole.entities.ApiKey.update(key.id, {
    last_used_at: new Date().toISOString(),
  }).catch(() => {});
  return { key };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const token = parseApiKey(req);
    const auth = await authenticateKey(base44, token, 'write:projects');
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

    const { id } = await req.json().catch(() => ({}));
    if (!id) return Response.json({ error: 'id is required' }, { status: 400 });

    const project = await base44.asServiceRole.entities.Project.get(id).catch(() => null);
    if (!project || project.tenant_id !== auth.key.tenant_id) {
      return Response.json({ error: 'Project not found' }, { status: 404 });
    }
    if (project.state !== 'accepted' && project.state !== 'failed_to_sync') {
      return Response.json({
        error: `Project is in '${project.state}' state — only 'accepted' or 'failed_to_sync' can be acknowledged.`,
      }, { status: 409 });
    }

    const updated = await base44.asServiceRole.entities.Project.update(project.id, {
      state: 'synchronized',
      acknowledged_at: new Date().toISOString(),
      acknowledged_by: auth.key.id,
      sync_error: null,
    });

    // Fire the project.synchronized webhook asynchronously.
    // Use regular functions.invoke — asServiceRole.functions.invoke is rejected
    // by the platform's invoke layer with a blanket 403. dispatchWebhook's
    // permissive auth gate accepts the API-key authenticated caller (null user).
    base44.functions.invoke('dispatchWebhook', {
      tenant_id: auth.key.tenant_id,
      event: 'project.synchronized',
      project_id: project.id,
    }).catch((e) => console.error('webhook dispatch failed:', e.message));

    return Response.json({ success: true, project: { id: updated.id, state: updated.state, acknowledged_at: updated.acknowledged_at } });
  } catch (error) {
    console.error('apiProjectsAcknowledge error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});