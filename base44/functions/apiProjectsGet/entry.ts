// Get a single project (origin + minimal destination representation).
// Body: { id: string }   (project_id, not external_id)
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
    const auth = await authenticateKey(base44, token, 'read:projects');
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

    const { id } = await req.json().catch(() => ({}));
    if (!id) return Response.json({ error: 'id is required' }, { status: 400 });

    const project = await base44.asServiceRole.entities.Project.get(id).catch(() => null);
    if (!project || project.tenant_id !== auth.key.tenant_id) {
      return Response.json({ error: 'Project not found' }, { status: 404 });
    }

    // BeLazy doctrine (api.belazy.cat/getting-started/belazy-basics/mapping):
    //   "The `destination` representation will only ever include values that you
    //    uploaded into BeLazy, and prevent any unmapped data from causing errors."
    // i.e. destination is NEVER a passthrough — unmapped source values must surface
    // as nulls + an `unmapped` list so the downstream BMS can refuse to import the
    // project (or surface a remediation card) instead of receiving garbage IDs.
    const allMappings = await base44.asServiceRole.entities.FieldMapping.filter({
      tenant_id: auth.key.tenant_id, is_active: true,
    });
    const portalMaps = allMappings.filter(m => m.portal === project.portal || m.portal === '*');
    const applied = [];
    const unmapped = [];
    const translate = (field, value) => {
      if (!value) return null;
      const hit = portalMaps.find(m => m.field === field && String(m.source_value).toLowerCase() === String(value).toLowerCase());
      if (hit) {
        applied.push({ field, from: value, to: hit.destination_value });
        return hit.destination_value;
      }
      // No mapping → destination value is unresolvable. Record it and return null.
      unmapped.push({ field, source_value: value });
      return null;
    };

    // Attachments count (catalog only — full list via apiAttachmentsList).
    const attCount = await base44.asServiceRole.entities.ProjectAttachment
      .filter({ tenant_id: auth.key.tenant_id, project_id: project.id })
      .then(r => r.length)
      .catch(() => 0);

    return Response.json({
      project: {
        id: project.id,
        external_id: project.external_id,
        state: project.state,
        portal: project.portal,
        name: project.name,
        client_name: project.client_name,
        project_name: project.project_name,
        source_language: project.source_language,
        target_language: project.target_language,
        word_count: project.word_count,
        price: project.price,
        currency: project.currency,
        due_date: project.due_date,
        accepted_at: project.accepted_at,
        acknowledged_at: project.acknowledged_at,
        delivered_at: project.delivered_at,
        origin: project.origin,
        destination: {
          source_language: translate('source_language', project.source_language),
          target_language: translate('target_language', project.target_language),
          client_name:     translate('client_name',     project.client_name),
        },
        mapping_applied: applied,
        unmapped,
        attachments_count: attCount,
      },
    });
  } catch (error) {
    console.error('apiProjectsGet error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});