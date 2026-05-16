// GET-style endpoint for downstream BMS: list projects (filterable by state).
// Auth: Authorization: Apikey <token>   (also accepts "Bearer <token>")
// Body params:
//   { state?: "accepted"|"synchronized"|"delivered"|"failed_to_sync", limit?: number (<=500) }
// Ordered by -accepted_at. For detail incl. mapping & attachments, see apiProjectsGet.
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

function serializeProject(p, clientById) {
  const c = p.client_id ? clientById.get(p.client_id) : null;
  return {
    id: p.id,
    external_id: p.external_id,
    state: p.state,
    portal: p.portal,
    // Agency end-customer attribution. `client` is null when the originating
    // portal isn't mapped to a Client yet — BMS clients should treat that as
    // "unassigned" rather than guessing from project_name/client_name.
    client: c ? { id: c.id, slug: c.slug, display_name: c.display_name } : null,
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
    acknowledged_by: p.acknowledged_by,
    delivered_at: p.delivered_at,
    sync_error: p.sync_error,
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
    // Optional client filter — BMS clients pass either the Client.id or the
    // human-friendly slug ("apple-inc"). We resolve slug → id once and apply
    // it as an entity filter so the page-cap doesn't truncate cross-client
    // result sets.
    if (body.client_id) {
      filter.client_id = String(body.client_id);
    } else if (body.client_slug) {
      const slugMatch = await base44.asServiceRole.entities.Client.filter({ slug: String(body.client_slug) });
      if (slugMatch.length === 0) {
        return Response.json({ error: `No client with slug "${body.client_slug}"` }, { status: 404 });
      }
      filter.client_id = slugMatch[0].id;
    }
    const projects = await base44.asServiceRole.entities.Project.filter(filter, '-accepted_at', limit);

    // Hydrate clients in one shot so each row doesn't trigger its own fetch.
    const clientIds = [...new Set(projects.map(p => p.client_id).filter(Boolean))];
    const clientById = new Map();
    if (clientIds.length > 0) {
      const clients = await base44.asServiceRole.entities.Client.list('-created_date', 500);
      clients.forEach(c => clientById.set(c.id, c));
    }

    return Response.json({
      count: projects.length,
      projects: projects.map(p => serializeProject(p, clientById)),
    });
  } catch (error) {
    console.error('apiProjectsList error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});