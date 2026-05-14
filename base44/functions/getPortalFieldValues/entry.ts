// Returns the set of distinct values for a (portal, field) pair, sourced from
// records that have actually passed through this app. This is what powers the
// data-aware dropdowns in RuleForm.
//
// Why not call the portal's fetch_function?
//   Function-to-function HTTP invocation is blocked in some environments
//   ("Backend functions cannot be accessed from the platform domain"), making
//   that path fragile. Reading our own entities is faster, deterministic, and
//   accurately reflects what the rule engine will actually see in production.
//
// Sources by portal:
//   globallink → GlobalLinkSubmission (rich staging table from polling)
//   symfonie/junction/* → AcceptedTask filtered by portal
//
// Input:  { portal_key, field, force? }
// Output: { values: string[], count, fetched_at, from_cache, source }
//
// Cache: CachedSnapshot keyed by fieldvalues_<portal>_<field>, 5 min fresh.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const FRESH_MS = 5 * 60 * 1000;
const MAX_RECORDS = 500;
const TEXT_FIELDS = new Set([
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
]);

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { portal_key, field, force } = body;
    if (!portal_key || !field) {
      return Response.json({ error: 'portal_key and field are required' }, { status: 400 });
    }
    if (!TEXT_FIELDS.has(field)) {
      return Response.json({ values: [], reason: 'numeric_or_unsupported_field' });
    }

    const cacheKey = `fieldvalues_${portal_key}_${field}`;

    // 1) Cache lookup
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
    //    portal_key === '*'  → union across ALL portals (used by FieldMapping where portal is "Any")
    //    portal_key === 'globallink' → GlobalLinkSubmission staging table
    //    else → AcceptedTask filtered by portal
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

    // 3) Extract uniques
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