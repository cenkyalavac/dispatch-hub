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

    // Hydrate everything we need to enrich the project in parallel —
    // attachments count, AcceptedTask (for cat_analysis), Client (for
    // end-customer attribution), and FriendlyName rows (for rumuz overlay).
    const [attCount, at, clientRow, friendlyRows] = await Promise.all([
      base44.asServiceRole.entities.ProjectAttachment
        .filter({ tenant_id: auth.key.tenant_id, project_id: project.id })
        .then(r => r.length)
        .catch(() => 0),
      project.accepted_task_id
        ? base44.asServiceRole.entities.AcceptedTask.get(project.accepted_task_id).catch(() => null)
        : Promise.resolve(null),
      project.client_id
        ? base44.asServiceRole.entities.Client.get(project.client_id).catch(() => null)
        : Promise.resolve(null),
      base44.asServiceRole.entities.FriendlyName.list('-created_date', 2000).catch(() => []),
    ]);

    // CAT leverage breakdown — built from the AcceptedTask row. Same shape as
    // apiProjectsList.cat_analysis so list and detail agree. null when no CAT
    // data was captured at accept time (older rows, portals without analysis).
    let catAnalysis = null;
    if (at) {
      const bands = {
        context:  Number(at.lev_context)  || 0,
        rep:      Number(at.lev_rep)      || 0,
        match100: Number(at.lev_match100) || 0,
        fuzzy_95_99: Number(at.lev_9599) || 0,
        fuzzy_85_94: Number(at.lev_8594) || 0,
        fuzzy_75_84: Number(at.lev_7584) || 0,
        fuzzy_50_74: Number(at.lev_5074) || 0,
        rep_95_99: Number(at.lev_rep_9599) || 0,
        rep_85_94: Number(at.lev_rep_8594) || 0,
        rep_75_84: Number(at.lev_rep_7584) || 0,
        rep_50_74: Number(at.lev_rep_5074) || 0,
        no_match: Number(at.lev_no_match) || 0,
      };
      const weightedWc = Number(at.weighted_wc) || 0;
      const total = Object.values(bands).reduce((s, v) => s + v, 0);
      if (total > 0 || weightedWc > 0) {
        catAnalysis = { weighted_wc: weightedWc, parser_type: at.parser_type || null, bands };
      }
    }

    const client = clientRow
      ? { id: clientRow.id, slug: clientRow.slug, display_name: clientRow.display_name }
      : null;
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
        cat_analysis: catAnalysis,
      },
    });
  } catch (error) {
    console.error('apiProjectsGet error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});