import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const PROD_BASE = 'https://hypnos.welocalize.tools';

function evaluateCondition(value, operator, target) {
  const s = String(value ?? '').toLowerCase();
  const t = String(target ?? '').toLowerCase();
  const n = Number(value), nt = Number(target);
  switch (operator) {
    case 'contains': return s.includes(t);
    case 'not_contains': return !s.includes(t);
    case 'equals': return s === t;
    case 'starts_with': return s.startsWith(t);
    case 'greater_than': return n > nt;
    case 'less_than': return n < nt;
    case 'greater_equal': return n >= nt;
    case 'less_equal': return n <= nt;
    default: return false;
  }
}

function matchesRule(task, rule) {
  if (!rule.conditions?.length) return false;
  return rule.conditions.every(c => evaluateCondition(task[c.field], c.operator, c.value));
}

// Build auth headers once per run; x-api-key is defensive (Welocalize UI sends it).
function authHeaders(jwt, apiKey, withContentType = false) {
  const h = { 'x-pantheon-auth': jwt };
  if (withContentType) h['Content-Type'] = 'application/json';
  if (apiKey) h['x-api-key'] = apiKey;
  return h;
}

// Junction rate-limit policy: default 500/min on most endpoints. The scheduler
// can burst-accept dozens of offers in a single tick — wrap mutating calls in
// exponential backoff so a transient 429/5xx doesn't poison the run.
async function jFetchRetry(url, init) {
  for (let attempt = 0; attempt <= 3; attempt++) {
    const r = await fetch(url, init);
    if (r.ok) return r;
    if (![429, 502, 503, 504].includes(r.status) || attempt === 3) return r;
    await new Promise((res) => setTimeout(res, Math.min(1000 * 2 ** attempt, 8000)));
  }
}

async function acceptOffer(apiBase, jwt, apiKey, offerId) {
  const r = await jFetchRetry(`${apiBase}/v1/offer/accept-bulk`, {
    method: 'PUT',
    headers: authHeaders(jwt, apiKey, true),
    body: JSON.stringify({ ids: [Number(offerId)] }),
  });
  if (!r.ok) return { ok: false, taskId: null };
  // Junction's accept-bulk response carries the resulting task id(s). Shape
  // varies by deploy — probe the known candidates. Used downstream for CAT
  // enrichment via /v1/task/{id}?$include=taskDetails.
  const j = await r.clone().json().catch(() => null);
  const taskId =
    j?.tasks?.[0]?.id ??
    j?.data?.[0]?.taskId ??
    j?.data?.[0]?.id ??
    j?.[0]?.taskId ??
    j?.[0]?.id ??
    null;
  return { ok: true, taskId };
}

// Best-effort CAT enrichment for a single accepted task. Returns the
// portal-neutral lev_* + weighted_wc + parser_type bag, or {} if the
// detail call can't be made or fails. Never throws — the offer is already
// claimed at the point this is called.
async function fetchCatFields(apiBase, jwt, apiKey, taskId) {
  if (!taskId) return {};
  try {
    const detailUrl = `${apiBase}/v1/task/${taskId}?$include=taskDetails`;
    const dr = await jFetchRetry(detailUrl, { headers: authHeaders(jwt, apiKey) });
    if (!dr.ok) {
      console.warn(`Junction task detail HTTP ${dr.status} for task ${taskId} — skipping CAT enrichment.`);
      return {};
    }
    const detail = await dr.json();
    const bands = Array.isArray(detail?.taskDetails) ? detail.taskDetails
      : Array.isArray(detail?.data?.taskDetails) ? detail.data.taskDetails
      : [];
    const qty = (name) => {
      const row = bands.find(b => b?.name === name);
      return Number(row?.unitQuantity) || 0;
    };
    return {
      lev_context:      qty('iceMatches'),
      lev_rep:          qty('repetitions'),
      lev_match100:     qty('oneHundred'),
      lev_9599:         qty('ninetyFive'),
      lev_8594:         qty('eightyFive'),
      lev_7584:         qty('seventyFive'),
      // mtPostEdit gets its OWN field — different WWC weight than newWords
      // (0.70 vs 1.00) per Welocalize TikTok regression. Folding them was
      // arithmetically wrong for the upstream weighted_wc validation.
      lev_mt_post_edit: qty('mtPostEdit'),
      lev_no_match:     qty('newWords'),
      // Junction TikTok-program default. Per-account override path is open
      // via this field; programs other than TikTok may need a different
      // coefficient (industry range 0.4-0.6; Welocalize is unusually high).
      mt_weight_coefficient: 0.70,
      weighted_wc:  Number(detail?.weightedWordCount ?? detail?.data?.weightedWordCount) || 0,
      parser_type:  'Junction',
    };
  } catch (e) {
    console.warn(`Junction task detail fetch failed for task ${taskId}:`, e.message);
    return {};
  }
}

async function rejectOffer(apiBase, jwt, apiKey, offerId, reason = 'capacity') {
  // Doc allows reason categories: schedule (UTC date required), capacity,
  // specialty, other (free-text note required). "capacity" is the safest
  // automated default — no extra context demanded by the API.
  const r = await jFetchRetry(`${apiBase}/v1/offer/${offerId}/reject`, {
    method: 'PUT',
    headers: authHeaders(jwt, apiKey, true),
    body: JSON.stringify({ reasons: [{ reasonCategory: reason, reasonExplanation: null }] }),
  });
  return r.ok;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Admin gate: allow admin users and scheduled/system calls (no user context).
    // Reject regular users — this endpoint accepts/rejects offers, very sensitive.
    const user = await base44.auth.me().catch(() => null);
    if (user !== null && user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const jwt = Deno.env.get('JUNCTION_JWT');
    const apiKey = Deno.env.get('JUNCTION_API_KEY');
    const apiBase = PROD_BASE;
    // Surface real HTTP status so the scheduler / UI can distinguish
    // "misconfigured" from "ran successfully but did nothing".
    if (!jwt) return Response.json({ success: false, error: 'JUNCTION_JWT not configured' }, { status: 503 });

    // Kill switch: if the Junction portal is toggled off in the UI, do nothing.
    const junctionPortalRows = await base44.asServiceRole.entities.Portal.filter({ key: 'junction' });
    const junctionPortal = junctionPortalRows[0] || null;
    if (junctionPortal && junctionPortal.is_active === false) {
      console.log('junctionProcessOffers skipped: portal is_active=false');
      return Response.json({ success: true, skipped: true, reason: 'Portal disabled', summary: { accepted: 0, rejected: 0, skipped: 0, errors: 0 } });
    }

    // Concurrency lease — stop two scheduler ticks running this function in
    // parallel. Stale leases (expires_at < now) are treated as released so a
    // crashed run never blocks the next tick. TTL = 10 min, comfortably above
    // typical Junction run times (3 surfaces × N offers).
    const LEASE_KEY = 'junction_process_lease';
    const LEASE_TTL_MS = 10 * 60 * 1000;
    const leaseToken = crypto.randomUUID();
    const nowMs = Date.now();
    const existingLeaseRows = await base44.asServiceRole.entities.AppSetting
      .filter({ key: LEASE_KEY })
      .catch(() => []);
    const existingLease = existingLeaseRows[0] || null;
    if (existingLease?.value) {
      try {
        const parsed = JSON.parse(existingLease.value);
        if (parsed?.expires_at && parsed.expires_at > nowMs) {
          console.log(`junctionProcessOffers skipped: concurrent run holds lease until ${new Date(parsed.expires_at).toISOString()}`);
          return Response.json({ success: true, skipped: true, reason: 'Concurrent run in progress', summary: { accepted: 0, rejected: 0, skipped: 0, errors: 0 } });
        }
      } catch { /* malformed lease — treat as stale */ }
    }
    const leaseValue = JSON.stringify({ token: leaseToken, expires_at: nowMs + LEASE_TTL_MS });
    if (existingLease) {
      await base44.asServiceRole.entities.AppSetting.update(existingLease.id, { value: leaseValue })
        .catch((e) => console.error('lease update failed (continuing):', e.message));
    } else {
      await base44.asServiceRole.entities.AppSetting.create({ key: LEASE_KEY, value: leaseValue, description: 'Concurrency lease for junctionProcessOffers. Auto-managed.' })
        .catch((e) => console.error('lease create failed (continuing):', e.message));
    }

    const releaseLease = async () => {
      const rows = await base44.asServiceRole.entities.AppSetting.filter({ key: LEASE_KEY }).catch(() => []);
      if (rows[0]) {
        await base44.asServiceRole.entities.AppSetting.update(rows[0].id, { value: '' })
          .catch((e) => console.error('lease release failed (will expire naturally):', e.message));
      }
    };

    // Client attribution: tag every AcceptedTask + Project with this portal's
    // Client.id so the BMS can filter projects by end-customer.
    const portalClientId = junctionPortal?.client_id || null;

    // 1. Fetch offers — three surfaces:
    //    /me        → offers exclusively addressed to this account
    //    /available → first-come-first-served pool (Spotify LQA et al land here)
    //    /rosters   → team-visible offers
    // Polling only /me historically meant /available offers (the real-world
    // majority on Welocalize) were never auto-processed. We fan out in parallel
    // and dedupe by offer id so the same offer can't be double-counted if it
    // ever appears on more than one surface.
    const OFFER_PATHS = ['/v2/offer/me', '/v2/offer/available', '/v2/offer/rosters'];
    const settled = await Promise.allSettled(
      OFFER_PATHS.map((p) => fetch(`${apiBase}${p}`, { headers: authHeaders(jwt, apiKey) }))
    );
    // If ALL three surfaces fail we bail loudly. Partial failure is logged but
    // we still process whatever we got back — common case: /me 200, /rosters 403.
    const fetchErrors = [];
    const offerLists = await Promise.all(settled.map(async (s, i) => {
      if (s.status !== 'fulfilled') {
        fetchErrors.push(`${OFFER_PATHS[i]}: ${s.reason?.message || 'fetch failed'}`);
        return [];
      }
      const r = s.value;
      if (!r.ok) {
        const text = await r.text().catch(() => '');
        fetchErrors.push(`${OFFER_PATHS[i]}: HTTP ${r.status} ${text.slice(0, 120)}`);
        return [];
      }
      const data = await r.json().catch(() => ({}));
      return Array.isArray(data) ? data : (data?.data || []);
    }));
    if (fetchErrors.length === OFFER_PATHS.length) {
      // Release lease before early-return — otherwise a Junction outage
      // would block every subsequent tick for LEASE_TTL_MS.
      await releaseLease();
      return Response.json(
        { success: false, error: `All Junction offer endpoints failed: ${fetchErrors.join(' | ')}` },
        { status: 502 }
      );
    }
    // Dedupe by offer id across the three lists.
    const seen = new Set();
    const offers = offerLists.flat().filter((o) => {
      const id = o.id ?? o.offerId;
      if (id == null || seen.has(id)) return false;
      seen.add(id);
      return true;
    });

    // 2. Get active rules for junction
    const rules = (await base44.asServiceRole.entities.Rule.filter({ is_active: true, portal: 'junction' }))
      .sort((a, b) => (a.priority || 1) - (b.priority || 1));

    // 3. Skip already-processed
    const processedIds = new Set((await base44.asServiceRole.entities.AcceptedTask.filter({ portal: 'junction' }, '-created_date', 2000))
      .map(t => Number(t.task_id)));

    const summary = { accepted: 0, rejected: 0, skipped: 0, errors: 0 };
    const details = { accepted: [], rejected: [], skipped: [], errors: [] };

    for (const offer of offers) {
      // /v2/offer/me may return either:
      //   nested  → { id, taskDetail: { name, project: { name, client: {...} } } }
      //   flat    → { offerId, taskId, taskLabel, projectName, accountName,
      //               sourceLocale, targetLocale, dueDate, subtotal, ... }
      // Verified live 2026-05-16: /available is flat, /me historically nested.
      // Probe nested first (back-compat), fall back to flat — keeps every
      // existing junction rule working AND lets the scheduler match flat-shape
      // offers without per-shape rule edits.
      const offerId = offer.id ?? offer.offerId ?? null;
      if (processedIds.has(Number(offerId))) continue;
      const td = offer.taskDetail || offer.task || {};
      const project = td.project || offer.project || {};
      // Field meaning (matches junctionGetOffers — single source of truth):
      //   project_name  = real project code (projectName: "SPOTIFY_2605_P2037")
      //   client_name   = program/account label (programLabel: "Spotify Transcreation"),
      //                   not the legal entity — rules typically target the
      //                   human-friendly program.
      //   word_count    = only set when unitOfMeasure is explicitly WORD/WORDS;
      //                   LQA tasks (unitOfMeasure=null, unitQuantityTotal in
      //                   minutes) return 0 so numeric rules don't fire on
      //                   "0.1 minutes" thinking it's a word count.
      const unit = (offer.unitOfMeasure || td.unitOfMeasure || '').toUpperCase();
      const isWordUnit = unit === 'WORD' || unit === 'WORDS';
      const rawWc = td.wordCount
        ?? offer.weightedWordCount
        ?? (isWordUnit ? offer.unitQuantityTotal : null)
        ?? 0;
      // Mirror junctionGetOffers' field policy exactly so rules and UI agree.
      // project_name → real project CODE (PM-facing identifier).
      // client_name  → program/account LABEL (the human-friendly name rules
      // typically target). accountName (legal entity) is the last fallback.
      const task = {
        task_id: offerId,
        task_name: td.name || offer.taskLabel || `Offer #${offerId}`,
        project_name: project.name || td.projectName || offer.projectName || offer.programLabel || '',
        client_name: offer.programLabel || project.client?.name || project.clientName || offer.accountName || offer.companyName || '',
        source_language: td.sourceLocale || td.sourceLanguage || offer.sourceLocale || '',
        target_language: td.targetLocale || td.targetLanguage || offer.targetLocale || '',
        word_count: rawWc || 0,
        // Flat uses `subtotal` for the line total (USD); nested uses `amount`.
        price: offer.amount || td.amount || offer.subtotal || 0,
        due_date: offer.dueDate || td.dueDate || null,
        // Workflow: explicit field only — taskLabel is task TYPE, not workflow,
        // so we never alias it here (same policy as junctionGetOffers).
        workflow_name: td.workflow || td.workflowName || '',
        // Surface Junction-specific extras so rules can target them via
        // rule_fields (e.g. "service_tag contains Marketing"). These don't
        // exist on the AcceptedTask schema, so we strip them before insert.
        service_tag: td.serviceTag || td.service || offer.contentSpecialty || '',
        task_type: td.taskType || offer.taskLabel || '',
      };

      const matched = rules.find(r => matchesRule(task, r));
      if (!matched) {
        summary.skipped++;
        details.skipped.push({ id: offerId, name: task.task_name, source_language: task.source_language, target_language: task.target_language, project_name: task.project_name });
        // Fire a notification for human review (one-click accept link in email).
        // Fire-and-forget — notification failure never blocks the poll.
        // Use regular functions.invoke — asServiceRole.functions.invoke is
        // rejected by the platform's invoke layer with a blanket 403 before
        // reaching the target function. Scheduled-context invoke passes
        // through and notifyNewTask's permissive auth gate accepts the
        // service caller.
        base44.functions.invoke('notifyNewTask', {
          portal: 'junction',
          task_id: offerId,
          task_payload: task,
        }).catch((e) => console.error('notifyNewTask failed:', e.message));
        continue;
      }

      try {
        let acceptResult = { ok: false, taskId: null };
        if (matched.action === 'accept') {
          acceptResult = await acceptOffer(apiBase, jwt, apiKey, offerId);
        } else {
          acceptResult.ok = await rejectOffer(apiBase, jwt, apiKey, offerId);
        }

        if (!acceptResult.ok) {
          summary.errors++;
          details.errors.push({ id: offerId, error: 'API call failed' });
          continue;
        }

        // CAT enrichment only on accept — reject doesn't produce a task.
        // Sequential per-offer call is fine: jFetchRetry already handles
        // rate limits, and we're already throttled by the upstream accept.
        const catFields = matched.action === 'accept'
          ? await fetchCatFields(apiBase, jwt, apiKey, acceptResult.taskId)
          : {};

        const acceptedAt = new Date().toISOString();
        // Strip Junction-only extras (service_tag, task_type) before writing —
        // they're rule-evaluation inputs, not part of the AcceptedTask schema.
        const { service_tag, task_type, ...persistedTask } = task;
        const savedTask = await base44.asServiceRole.entities.AcceptedTask.create({
          portal: 'junction',
          client_id: portalClientId,
          ...persistedTask,
          accepted_at: acceptedAt,
          matched_rule: matched.name,
          status: matched.action === 'accept' ? 'accepted' : 'rejected',
          sheets_synced: false,
          ...catFields,
        });

        // Mirror Symfonie: every rule-accepted task gets a Project record + webhook fire.
        // Without this, junction-accepted tasks never reach the BMS pipeline.
        if (matched.action === 'accept') {
          try {
            const project = await base44.asServiceRole.entities.Project.create({
              tenant_id: 'default',
              client_id: portalClientId,
              accepted_task_id: savedTask.id,
              portal: 'junction',
              external_id: `junction:${offerId}`,
              state: 'accepted',
              name: task.task_name,
              client_name: task.client_name || '',
              project_name: task.project_name || '',
              source_language: task.source_language || '',
              target_language: task.target_language || '',
              word_count: task.word_count || 0,
              price: task.price || 0,
              currency: 'USD',
              due_date: task.due_date || null,
              accepted_at: acceptedAt,
              origin: task,
            });
            base44.functions.invoke('dispatchWebhook', {
              tenant_id: 'default', event: 'project.accepted', project_id: project.id,
            }).catch((e) => console.error('webhook dispatch failed:', e.message));
          } catch (e) {
            console.error(`Project create failed for offer ${offerId}:`, e.message);
          }
          summary.accepted++;
          details.accepted.push(task.task_name);
        } else {
          summary.rejected++;
          details.rejected.push(task.task_name);
        }
      } catch (err) {
        summary.errors++;
        details.errors.push({ id: offerId, error: err.message });
      }
    }

    // Best-effort last_sync_at update — wrap so a transient DB hiccup
    // doesn't bypass the lease release at end-of-run. Mirrors Symfonie /
    // GlobalLink's non-fatal Portal.update pattern.
    await base44.asServiceRole.entities.Portal.filter({ key: 'junction' }).then(async (rows) => {
      if (rows[0]) {
        await base44.asServiceRole.entities.Portal.update(rows[0].id, {
          last_sync_at: new Date().toISOString(),
        }).catch((e) => console.error('Portal last_sync_at update failed:', e.message));
      }
    }).catch((e) => console.error('Portal lookup failed:', e.message));

    // Batch sheet sync — single source of truth for column mapping + routing.
    if (summary.accepted > 0) {
      base44.functions.invoke('sheetsSyncPending', {})
        .catch((e) => console.error('sheetsSyncPending trigger failed:', e.message));
    }

    // Happy-path auto-resolve: any open poll_failure for this portal is stale.
    base44.functions.invoke('resolveSystemIssues', { type: 'poll_failure', portal: 'junction' })
      .catch((e) => console.error('resolveSystemIssues failed:', e.message));

    await releaseLease();

    return Response.json({
      success: true,
      summary,
      details,
      total_offers: offers.length,
      ...(fetchErrors.length > 0 ? { partial_fetch_errors: fetchErrors } : {}),
    });
  } catch (error) {
    // Best-effort lease release on error — stale lease will expire naturally
    // after LEASE_TTL_MS regardless.
    try {
      const b2 = createClientFromRequest(req);
      const rows = await b2.asServiceRole.entities.AppSetting.filter({ key: 'junction_process_lease' });
      if (rows[0]) await b2.asServiceRole.entities.AppSetting.update(rows[0].id, { value: '' });
    } catch { /* lease expires on TTL */ }
    try {
      const b = createClientFromRequest(req);
      b.functions.invoke('recordSystemIssue', {
        type: 'poll_failure',
        severity: 'warning',
        portal: 'junction',
        function_name: 'junctionProcessOffers',
        dedup_key: 'poll',
        title: 'Junction poll failed',
        description: error.message,
      }).catch((e) => console.error('recordSystemIssue failed:', e.message));
    } catch { /* never mask the original error */ }
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});