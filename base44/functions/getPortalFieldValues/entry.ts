// Returns the set of distinct values for a (portal, field) pair, sourced from
// records that have actually passed through this app. Powers data-aware
// dropdowns in RuleForm, MappingForm, SheetRouteRow.
//
// Auth: any signed-in user (not admin-gated). The function only reads
// integration data the user already has access to via normal SDK calls.
//
// Sources by portal:
//   globallink → GlobalLinkSubmission (rich staging table from polling)
//   symfonie/junction/* → AcceptedTask filtered by portal
//   '*' → union across all
//
// Cache: CachedSnapshot keyed by fieldvalues_<portal>_<field>, 5 min fresh.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const FRESH_MS = 5 * 60 * 1000;
const MAX_RECORDS = 500;

// Whitelist kept for the legacy `field` validation. Pulled from
// the union of all known portal vocabularies — anything not in here returns
// an empty array. Add new field names here when a new portal needs one.
const KNOWN_TEXT_FIELDS = new Set([
  'project_name',
  'task_name',
  'workflow_name',
  'source_language',
  'target_language',
  'client_name',
  'project_manager_first_name',
  'project_manager_last_name',
  'matched_rule',
  'service_tag',
  'submission_id',
  'submission_name',
  'submission_ticket',
  'phase_name',
  'deadline_at',
]);

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Soft auth — we want to NOT crash on auth.me() platform errors, but we
    // also want to refuse anonymous callers. createClientFromRequest already
    // hands us a request-scoped client; if there's no signed-in user the call
    // below resolves to null (the SDK swallows the auth error in some paths).
    const user = await base44.auth.me().catch(() => null);
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { portal_key, field, force } = body;
    if (!portal_key || !field) {
      return Response.json({ error: 'portal_key and field are required' }, { status: 400 });
    }
    if (!KNOWN_TEXT_FIELDS.has(field)) {
      return Response.json({ values: [], reason: 'numeric_or_unsupported_field' });
    }

    const cacheKey = `fieldvalues_${portal_key}_${field}`;

    // 1) Cache lookup. CRITICAL: use asServiceRole for ALL entity reads here.
    //    User-scoped reads on cross-tenant cache entities can trigger
    //    "Authentication required to view users" inside Base44's auth chain.
    if (!force) {
      const cached = await base44.asServiceRole.entities.CachedSnapshot.filter({ key: cacheKey });
      const hit = cached?.[0];
      if (hit?.fetched_at && (Date.now() - new Date(hit.fetched_at).getTime() < FRESH_MS)) {
        return Response.json({
          values: hit.data?.values || [],
          count: hit.item_count || 0,
          fetched_at: hit.fetched_at,
          from_cache: true,
          source: hit.source_function || 'cache',
        });
      }
    }

    // 2) Choose record source
    let records = [];
    let source = '';
    if (portal_key === '*') {
      const [accepted, glSubs] = await Promise.all([
        base44.asServiceRole.entities.AcceptedTask.list('-created_date', MAX_RECORDS),
        base44.asServiceRole.entities.GlobalLinkSubmission.list('-created_date', MAX_RECORDS),
      ]);
      records = [...accepted, ...glSubs];
      source = 'AcceptedTask+GlobalLinkSubmission';
    } else if (portal_key === 'globallink') {
      records = await base44.asServiceRole.entities.GlobalLinkSubmission
        .list('-created_date', MAX_RECORDS);
      source = 'GlobalLinkSubmission';
    } else {
      records = await base44.asServiceRole.entities.AcceptedTask
        .filter({ portal: portal_key }, '-created_date', MAX_RECORDS);
      source = 'AcceptedTask';
    }

    // 3) Extract uniques (case-insensitive de-dupe, keep first-seen casing)
    const seen = new Map();
    for (const r of records) {
      const raw = r?.[field];
      if (raw === null || raw === undefined) continue;
      const str = String(raw).trim();
      if (!str) continue;
      const lc = str.toLowerCase();
      if (!seen.has(lc)) seen.set(lc, str);
    }
    const values = Array.from(seen.values()).sort((a, b) => a.localeCompare(b));

    // 4) Persist snapshot
    const now = new Date().toISOString();
    const payload = {
      key: cacheKey,
      data: { values, portal_key, field },
      fetched_at: now,
      source_function: source,
      item_count: values.length,
    };
    const existing = await base44.asServiceRole.entities.CachedSnapshot.filter({ key: cacheKey });
    if (existing?.[0]?.id) {
      await base44.asServiceRole.entities.CachedSnapshot.update(existing[0].id, payload);
    } else {
      await base44.asServiceRole.entities.CachedSnapshot.create(payload);
    }

    console.log('[getPortalFieldValues] computed', {
      portal_key, field, source, sample_records: records.length, distinct: values.length,
    });

    return Response.json({
      values,
      count: values.length,
      fetched_at: now,
      from_cache: false,
      source,
    });
  } catch (error) {
    console.error('[getPortalFieldValues] error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});