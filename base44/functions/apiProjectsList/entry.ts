// GET-style endpoint for downstream BMS: list projects (filterable by state).
// Auth: Authorization: Apikey <token>   (also accepts "Bearer <token>")
// Body or query params (we accept JSON body since base44 functions only receive payload through invoke):
//   { state?: "accepted"|"synchronized"|"delivered"|"failed_to_sync", limit?: number, skip?: number, since?: ISO }
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
  // Best-effort last-used update; don't block on failure.
  base44.asServiceRole.entities.ApiKey.update(key.id, {
    last_used_at: new Date().toISOString(),
  }).catch(() => {});
  return { key };
}

function serializeProject(p) {
  return {
    id: p.id,
    external_id: p.external_id,
    state: p.state,
    portal: p.portal,
    name: p.name,
    client_name: p.client_name,
    project_name: p.project_name,
    source_language: p.source_language,
    target_language: p.target_language,
    word_count: p.word_count,
    price: p.price,
    currency: p.currency,
    due_date: p.due_date,
    accepted_at: p.accepted_at,
    acknowledged_at: p.acknowledged_at,
    delivered_at: p.delivered_at,
    origin: p.origin,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const token = parseApiKey(req);
    const auth = await authenticateKey(base44, token, 'read:projects');
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const state = body.state || 'accepted';
    const limit = Math.min(Number(body.limit) || 100, 500);

    const filter = { tenant_id: auth.key.tenant_id, state };
    const projects = await base44.asServiceRole.entities.Project.filter(filter, '-accepted_at', limit);

    return Response.json({
      count: projects.length,
      projects: projects.map(serializeProject),
    });
  } catch (error) {
    console.error('apiProjectsList error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});