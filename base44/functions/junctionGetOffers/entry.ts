import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const PROD_BASE = 'https://hypnos.welocalize.tools';

// Three offer surfaces, all on the same Pantheon host. The UI exposes them as
// "My Offers" (me), "Open Offers" (available — first-come pool), and "Team Mate
// Offers" (rosters — visible to the team). Verified live: all three return the
// same { data, meta:{ count } } envelope and accept $limit/$offset/$order_by/$order_dir.
const OFFER_PATHS = {
  me: '/v2/offer/me',
  available: '/v2/offer/available',
  rosters: '/v2/offer/rosters',
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Admin gate: allow admin users and scheduled/system calls (no user context).
    // Reject regular users — this endpoint returns Junction offers (sensitive).
    const user = await base44.auth.me().catch(() => null);
    if (user !== null && user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Optional params — body OR query string, both supported for SDK + browser use.
    // Defaults preserve the legacy behavior: /v2/offer/me, no pagination.
    let body = {};
    try { body = await req.json(); } catch { body = {}; }
    const url = new URL(req.url, 'http://localhost');
    const qp = url.searchParams;
    const offerType = body.offer_type ?? qp.get('offer_type') ?? 'me';
    const limit  = body.limit  ?? qp.get('limit');
    const offset = body.offset ?? qp.get('offset');
    const orderBy  = body.order_by  ?? qp.get('order_by');
    const orderDir = body.order_dir ?? qp.get('order_dir');

    const path = OFFER_PATHS[offerType];
    if (!path) {
      return Response.json({
        success: false,
        error: `Invalid offer_type "${offerType}". Allowed: me, available, rosters.`,
        tasks: [],
      }, { status: 400 });
    }

    const jwt = Deno.env.get('JUNCTION_JWT');
    const apiKey = Deno.env.get('JUNCTION_API_KEY');
    const apiBase = PROD_BASE;

    if (!jwt) {
      return Response.json({ success: false, error: 'JUNCTION_JWT not configured', offers: [] });
    }

    // Defensive: send x-api-key when configured (Welocalize UI sends it; not yet enforced).
    const authHeaders = { 'x-pantheon-auth': jwt, 'Accept': 'application/json' };
    if (apiKey) authHeaders['x-api-key'] = apiKey;

    // Build the query string only when the caller asked for pagination/sort.
    // Junction uses $-prefixed params (URL-encoded as %24). Max page size: 25
    // per the official doc — we don't enforce it here; the server caps.
    const query = new URLSearchParams();
    if (limit != null)  query.set('$limit',  String(limit));
    if (offset != null) query.set('$offset', String(offset));
    if (orderBy)  query.set('$order_by',  String(orderBy));
    if (orderDir) query.set('$order_dir', String(orderDir));
    const qs = query.toString();
    const fetchUrl = qs ? `${apiBase}${path}?${qs}` : `${apiBase}${path}`;

    const r = await fetch(fetchUrl, { headers: authHeaders });
    if (!r.ok) {
      const text = await r.text();
      return Response.json({
        success: false,
        error: `Junction API HTTP ${r.status}: ${text.slice(0, 200)}`,
        offers: [],
      }, { status: r.status });
    }
    const data = await r.json();
    const offers = Array.isArray(data) ? data : (data?.data || []);
    // Live API returns `{ data, meta: { count } }` — surface `count` so the UI
    // can show "X of N" without re-counting on the client.
    const totalCount = data?.meta?.count ?? offers.length;

    // Normalize offers into a task-like shape for the UI.
    //
    // CAVEAT: the three offer endpoints return DIFFERENT shapes (verified live
    // against hypnos.welocalize.tools, 2026-05-16):
    //   /v2/offer/me        → nested  { id, taskDetail: { name, project: {...} }, ... }
    //   /v2/offer/available → flat    { offerId, taskId, taskLabel, programLabel,
    //                                   projectName, accountName, sourceLocale,
    //                                   targetLocale, dueDate, subtotal,
    //                                   weightedWordCount, unitQuantityTotal,
    //                                   unitOfMeasure, rejectable, ... }
    //   /v2/offer/rosters   → flat (same shape as /available, observed empty)
    //
    // FIELD MEANING (verified live with a real Spotify LQA offer):
    //   programLabel = umbrella program / account-level grouping
    //                  e.g. "Spotify Transcreation" — what the user perceives as "the client".
    //   projectName  = the actual project code/identifier
    //                  e.g. "SPOTIFY_2605_P2037" — what the PM references.
    //   accountName  = the legal client entity, e.g. "Spotify AB".
    //
    // We previously hoisted programLabel into project_name, which buried the
    // real project code. Now: project_name = projectName (the code),
    // project_code mirrors it for the row UI, and the program label flows
    // through workflow_name only when no actual workflow is provided.
    const tasks = offers.map(o => {
      const td = o.taskDetail || o.task || {};
      const project = td.project || o.project || {};
      const offerId = o.id ?? o.offerId ?? null;
      const taskId = td.id ?? o.taskId ?? o.task?.id ?? null;
      // Flat shape uses `subtotal` for line total; nested has `amount`.
      const price = o.amount ?? o.totalAmount ?? td.amount ?? o.subtotal ?? null;
      // word_count is portal-agnostic — but Junction units vary by task type:
      //   • Translation offers carry an explicit unitOfMeasure (WORD/WORDS),
      //     and `unitQuantityTotal` is the word count.
      //   • LQA offers come with unitOfMeasure = null and `unitQuantityTotal`
      //     in MINUTES (e.g. 0.1 means "tenth of a minute"). Surfacing that as
      //     "0.1 w" is a flat-out lie.
      // Policy: only trust `unitQuantityTotal` when the unit is explicitly
      // WORD/WORDS. Null/empty/anything else → 0. Translation jobs are
      // unaffected; LQA jobs correctly show 0 words.
      const unit = (o.unitOfMeasure || td.unitOfMeasure || '').toUpperCase();
      const isWordUnit = unit === 'WORD' || unit === 'WORDS';
      const rawWc = td.wordCount
        ?? td.words
        ?? td.sourceWordCount
        ?? o.weightedWordCount
        ?? (isWordUnit ? o.unitQuantityTotal : null)
        ?? 0;
      const wordCount = rawWc;
      // taskLabel = human-readable task type (e.g. "LQA Review") in flat shape;
      // matches Symfonie's task_name semantics for the row UI.
      const name = td.name || o.name || o.taskLabel || `Offer #${offerId}`;
      // project_name should carry the actual project code (PM-facing identifier).
      // project_code mirrors it so PendingTaskRow's hierarchical "Account › Project (code) › Job" still works.
      const projectName = project.name || td.projectName || o.projectName || o.programLabel || '';
      const projectCode = o.projectName || project.code || td.projectCode || '';
      // Account = the program/umbrella the client groups its work under, falling
      // back to the legal client entity. Junction's `accountName` is the legal
      // entity (Spotify AB); `programLabel` is the program (Spotify Transcreation).
      // The program is what humans recognize, so it takes precedence.
      const accountName = o.programLabel
        || project.client?.name
        || project.clientName
        || o.accountName
        || o.companyName
        || '';
      // Workflow: prefer an explicit workflow field; never alias the task label
      // into it (taskLabel is task type, not workflow). Empty string is fine.
      const workflow = td.workflow || td.workflowName || '';
      return {
        id: offerId,
        offer_id: offerId,
        task_id: taskId,
        name,
        project_name: projectName,
        project_code: projectCode,
        // client_name kept for back-compat with downstream code that didn't
        // know about account_name (rules, sheets, BMS API).
        client_name: accountName,
        account_name: accountName,
        source_language: td.sourceLocale || td.sourceLanguage || o.sourceLocale || '',
        target_language: td.targetLocale || td.targetLanguage || o.targetLocale || '',
        word_count: wordCount,
        // unit_of_measure left as-is from upstream — null/empty for LQA, "WORD"
        // for translation. Helps a future UI distinguish "0 words" (LQA) from
        // "0 words (still loading)" without re-fetching.
        unit_of_measure: unit || null,
        price_max_usd: price,
        price_min_usd: price,
        due_date: o.dueDate || td.dueDate || null,
        created_at: o.createdAt || o.startDate || null,
        workflow_name: workflow,
        service_tag: td.serviceTag || td.service || o.contentSpecialty || '',
        task_type: td.taskType || o.taskLabel || '',
        cat_tool: td.catTool || '',
        assigned_to: o.offeringUser?.name || o.userName || '',
        // /available carries a `rejectable: false` flag — surface it so the UI
        // can hide the manual reject button on locked pool offers.
        rejectable: o.rejectable ?? true,
        portal: 'junction',
      };
    });

    return Response.json({
      success: true,
      tasks,
      offer_type: offerType,
      summary: {
        total: tasks.length,
        total_available: totalCount,
        total_words: tasks.reduce((s, t) => s + (t.word_count || 0), 0),
        total_price: tasks.reduce((s, t) => s + (t.price_max_usd || 0), 0),
      },
    });
  } catch (error) {
    return Response.json({ success: false, error: error.message, offers: [] }, { status: 500 });
  }
});