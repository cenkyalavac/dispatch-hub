// List attachments for a given project. Body: { project_id }
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function parseApiKey(req) {
  // Base44 only forwards "Bearer"-scheme Authorization headers — "Apikey" is
  // rejected at the gateway before the handler runs. Bearer-only on purpose.
  const h = req.headers.get('authorization') || req.headers.get('Authorization') || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

async function authenticateKey(base44, token, scopeNeeded) {
  if (!token) return { error: 'Missing Authorization header (Bearer <token>)', status: 401 };
  const matches = await base44.asServiceRole.entities.ApiKey.filter({ token });
  const key = matches?.[0];
  if (!key) return { error: 'Invalid API key', status: 401 };
  if (key.revoked_at) return { error: 'API key has been revoked', status: 403 };
  if (scopeNeeded && Array.isArray(key.scopes) && !key.scopes.includes(scopeNeeded)) {
    return { error: `API key missing scope: ${scopeNeeded}`, status: 403 };
  }
  base44.asServiceRole.entities.ApiKey.update(key.id, { last_used_at: new Date().toISOString() }).catch(() => {});
  return { key };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const token = parseApiKey(req);
    const auth = await authenticateKey(base44, token, 'read:projects');
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

    const { project_id } = await req.json().catch(() => ({}));
    if (!project_id) return Response.json({ error: 'project_id is required' }, { status: 400 });

    // Tenant ownership check
    const project = await base44.asServiceRole.entities.Project.get(project_id).catch(() => null);
    if (!project || project.tenant_id !== auth.key.tenant_id) {
      return Response.json({ error: 'Project not found' }, { status: 404 });
    }

    const attachments = await base44.asServiceRole.entities.ProjectAttachment.filter(
      { tenant_id: auth.key.tenant_id, project_id },
      '-uploaded_at',
      500,
    );

    return Response.json({
      count: attachments.length,
      attachments: attachments.map(a => ({
        id: a.id,
        external_id: a.external_id,
        name: a.name,
        size: a.size,
        kind: a.kind,
        storage: a.storage,
        storage_path: a.storage_path,
        uploaded_at: a.uploaded_at,
      })),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});