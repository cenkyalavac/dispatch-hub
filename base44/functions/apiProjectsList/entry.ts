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

// End-client / account / division attribution lives BELOW the agency `client`
// (Welocalize/RWS/etc.). The BMS needs the raw upstream identifiers AND the
// human-friendly rumuz overlay so it can route a single Symfonie portal's
// traffic to Amazon vs. Adloc downstream without hardcoding string heuristics.
//
// friendlyRowsByType is a precomputed index: type → array of {match_by, source_value_lc, display_name, portal}.
// portal-specific rows ranked above '*' so a Symfonie-scoped rumuz wins over a
// global one. Same precedence as apiProjectsGet.
function buildFriendlyIndex(friendlyRows) {
  const index = { client: [], account: [], project: [], workflow: [] };
  for (const r of friendlyRows) {
    if (r.is_active === false) continue;
    if (!index[r.type]) continue;
    index[r.type].push({
      portal: r.portal,
      match_by: r.match_by || 'name',
      source_value_lc: String(r.source_value || '').toLowerCase(),
      display_name: r.display_name,
    });
  }
  // Portal-specific before '*'.
  for (const t of Object.keys(index)) {
    index[t].sort((a, b) => (a.portal === '*' ? 1 : 0) - (b.portal === '*' ? 1 : 0));
  }
  return index;
}

function resolveFriendly(index, type, portal, rawName, rawId) {
  const rows = index[type] || [];
  const nameLc = rawName ? String(rawName).toLowerCase() : '';
  const idLc = rawId != null ? String(rawId).toLowerCase() : '';
  for (const r of rows) {
    if (r.portal !== portal && r.portal !== '*') continue;
    if (r.match_by === 'id' && idLc && r.source_value_lc === idLc) return r.display_name;
    if (r.match_by === 'name' && nameLc && r.source_value_lc === nameLc) return r.display_name;
  }
  return rawName || null;
}

// Build a single cat_analysis block from an AcceptedTask row. Returns null
// when we have nothing useful to surface (every band is 0/missing AND there's
// no weighted_wc) — keeps the API payload clean.
function buildCatAnalysis(at) {
  if (!at) return null;
  const bands = {
    context:  Number(at.lev_context)  || 0,
    rep:      Number(at.lev_rep)      || 0,
    match100: Number(at.lev_match100) || 0,
    fuzzy_95_99: Number(at.lev_9599) || 0,
    fuzzy_85_94: Number(at.lev_8594) || 0,
    fuzzy_75_84: Number(at.lev_7584) || 0,
    fuzzy_50_74: Number(at.lev_5074) || 0,
    // GlobalLink-only sub-bands (reps that fall inside a fuzzy band). Symfonie
    // and Junction don't emit these — surface them when present so the BMS
    // can do GL-specific weighting without re-pulling the upstream.
    rep_95_99: Number(at.lev_rep_9599) || 0,
    rep_85_94: Number(at.lev_rep_8594) || 0,
    rep_75_84: Number(at.lev_rep_7584) || 0,
    rep_50_74: Number(at.lev_rep_5074) || 0,
    // Junction-specific today: machine-translation post-edit words. Carries
    // its own WWC weight (mt_weight_coefficient) so downstream pricing can
    // bill MT separately from raw new words.
    mt_post_edit: Number(at.lev_mt_post_edit) || 0,
    no_match: Number(at.lev_no_match) || 0,
  };
  const weightedWc = Number(at.weighted_wc) || 0;
  const bandsTotal = Object.values(bands).reduce((s, v) => s + v, 0);
  if (bandsTotal === 0 && weightedWc === 0) return null;
  return {
    weighted_wc: weightedWc,
    parser_type: at.parser_type || null,
    // null when no MTPE band was captured (Symfonie/GlobalLink today). Junction
    // tasks carry the program-default 0.70 unless overridden per account.
    mt_weight_coefficient: at.mt_weight_coefficient != null ? Number(at.mt_weight_coefficient) : null,
    bands,
  };
}

function serializeProject(p, clientById, friendlyIndex, acceptedTaskById) {
  const c = p.client_id ? clientById.get(p.client_id) : null;
  // Raw upstream identifiers — Project entity stores client_name/project_name
  // at the top level; account/project IDs and workflow_name live under origin.
  const accountName = p.origin?.account_name || p.origin?.client_name || p.client_name || null;
  const accountId = p.origin?.account_id != null ? String(p.origin.account_id) : null;
  const projectIdRaw = p.origin?.project_id != null ? String(p.origin.project_id) : null;
  const workflowName = p.origin?.workflow_name || null;

  const at = p.accepted_task_id ? acceptedTaskById.get(p.accepted_task_id) : null;
  const catAnalysis = buildCatAnalysis(at);

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
    // Friendly rumuz overlay (pass-through to raw value on miss — same
    // semantics as apiProjectsGet so list and detail agree).
    friendly: {
      client_name:   resolveFriendly(friendlyIndex, 'client',   p.portal, p.client_name, null),
      account_name:  resolveFriendly(friendlyIndex, 'account',  p.portal, accountName,   accountId),
      project_name:  resolveFriendly(friendlyIndex, 'project',  p.portal, p.project_name, projectIdRaw),
      workflow_name: resolveFriendly(friendlyIndex, 'workflow', p.portal, workflowName,  null),
    },
    // Raw upstream identifiers, surfaced at the top level so the BMS doesn't
    // have to dig into `origin` (which is portal-specific and unstable). Use
    // these to drive end-client / account / division routing downstream.
    raw: {
      account_name: accountName,
      account_id: accountId,
      project_id: projectIdRaw,
      workflow_name: workflowName,
    },
    // CAT leverage breakdown — hydrated from the underlying AcceptedTask.
    // null when no leverage data was captured at accept time (older rows,
    // portals without CAT analysis). Bands are portal-neutral; weighted_wc
    // is the source-of-truth weighted word count (Junction supplies it
    // precomputed; Symfonie reads it from CalculatedQuantity — the
    // customer's actual per-band grid; GlobalLink computes it client-side).
    cat_analysis: catAnalysis,
    // Vendor-side financial breakdown. Symfonie source: PurchaseOrder.Prices
    // (we are the vendor — partner_name is the entity paying us, usd_price
    // is what we'll invoice). Null when the upstream didn't attach a PO.
    vendor_payment: p.vendor_payment || null,
    // Free-text project brief from the originating portal. Symfonie source:
    // Project.Notes. Empty string when not provided.
    project_notes: p.project_notes || '',
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

    // Hydrate clients + friendly rumuz rows + AcceptedTask CAT data in parallel.
    // AcceptedTask is fetched via parallel .get() per project — bounded by
    // `limit` (max 500). Previous batched-list-then-intersect approach silently
    // dropped CAT data when the AcceptedTask page-cap was exceeded; parallel
    // gets are exact and cost the same on the wire.
    const acceptedTaskIds = projects.map(p => p.accepted_task_id).filter(Boolean);
    const [allClients, friendlyRows, acceptedTaskResults] = await Promise.all([
      projects.some(p => p.client_id)
        ? base44.asServiceRole.entities.Client.list('-created_date', 500)
        : Promise.resolve([]),
      base44.asServiceRole.entities.FriendlyName.list('-created_date', 2000).catch(() => []),
      Promise.all(acceptedTaskIds.map(id =>
        base44.asServiceRole.entities.AcceptedTask.get(id).catch(() => null)
      )),
    ]);
    const clientById = new Map();
    allClients.forEach(c => clientById.set(c.id, c));
    const friendlyIndex = buildFriendlyIndex(friendlyRows);
    const acceptedTaskById = new Map();
    acceptedTaskResults.forEach((at, i) => { if (at) acceptedTaskById.set(acceptedTaskIds[i], at); });

    return Response.json({
      count: projects.length,
      projects: projects.map(p => serializeProject(p, clientById, friendlyIndex, acceptedTaskById)),
    });
  } catch (error) {
    console.error('apiProjectsList error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});