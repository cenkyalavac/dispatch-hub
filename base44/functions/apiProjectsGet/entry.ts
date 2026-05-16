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

    // Agency end-customer attribution. Resolved from the Client entity via
    // the FK set at accept time. null when the originating portal wasn't
    // mapped to a client yet.
    let client = null;
    if (project.client_id) {
      const c = await base44.asServiceRole.entities.Client.get(project.client_id).catch(() => null);
      if (c) client = { id: c.id, slug: c.slug, display_name: c.display_name };
    }

    // Friendly rumuz block — separate from BMS `destination` (which stays
    // null-on-miss for safety). Friendly passes through to the raw value on
    // miss, so downstream BMS UIs can always render a human label.
    const friendlyRows = await base44.asServiceRole.entities.FriendlyName
      .list('-created_date', 2000)
      .catch(() => []);
    const FRIENDLY_TYPE_FIELDS = {
      client:   { nameField: 'client_name',   idField: null },
      account:  { nameField: 'account_name',  idField: null },
      project:  { nameField: 'project_name',  idField: null },
      workflow: { nameField: 'workflow_name', idField: null },
    };
    // Project entity stores client_name/project_name/source/target only at
    // top level; account_id and project_id live under `origin` if present.
    const taskLike = {
      portal: project.portal,
      client_name:  project.client_name,
      project_name: project.project_name,
      account_name: project.origin?.account_name || project.origin?.client_name || project.client_name,
      account_id:   project.origin?.account_id || null,
      project_id:   project.origin?.project_id || null,
      workflow_name: project.origin?.workflow_name || null,
    };
    const resolveFriendly = (type) => {
      const f = FRIENDLY_TYPE_FIELDS[type];
      if (!f) return null;
      const rawName = taskLike[f.nameField] != null ? String(taskLike[f.nameField]) : '';
      const rawId = type === 'account' ? (taskLike.account_id != null ? String(taskLike.account_id) : '')
                  : type === 'project' ? (taskLike.project_id != null ? String(taskLike.project_id) : '')
                  : '';
      const candidates = friendlyRows
        .filter((r) => r.is_active !== false && r.type === type && (r.portal === project.portal || r.portal === '*'))
        .sort((a, b) => (a.portal === '*' ? 1 : 0) - (b.portal === '*' ? 1 : 0));
      for (const r of candidates) {
        const match_by = r.match_by || 'name';
        const srcLc = String(r.source_value || '').toLowerCase();
        if (match_by === 'id' && rawId && srcLc === rawId.toLowerCase()) return r.display_name;
        if (match_by === 'name' && rawName && srcLc === rawName.toLowerCase()) return r.display_name;
      }
      return rawName || null;
    };

    return Response.json({
      project: {
        id: project.id,
        external_id: project.external_id,
        state: project.state,
        portal: project.portal,
        client,
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
        friendly: {
          client_name:   resolveFriendly('client'),
          account_name:  resolveFriendly('account'),
          project_name:  resolveFriendly('project'),
          workflow_name: resolveFriendly('workflow'),
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