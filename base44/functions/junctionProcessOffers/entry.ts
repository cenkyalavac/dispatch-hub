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
  return r.ok;
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
        base44.asServiceRole.functions.invoke('notifyNewTask', {
          portal: 'junction',
          task_id: offerId,
          task_payload: task,
        }).catch((e) => console.error('notifyNewTask failed:', e.message));
        continue;
      }

      try {
        const ok = matched.action === 'accept'
          ? await acceptOffer(apiBase, jwt, apiKey, offerId)
          : await rejectOffer(apiBase, jwt, apiKey, offerId);

        if (!ok) {
          summary.errors++;
          details.errors.push({ id: offerId, error: 'API call failed' });
          continue;
        }

        const acceptedAt = new Date().toISOString();
        // Strip Junction-only extras (service_tag, task_type) before writing —
        // they're rule-evaluation inputs, not part of the AcceptedTask schema.
        const { service_tag, task_type, ...persistedTask } = task;
        const savedTask = await base44.asServiceRole.entities.AcceptedTask.create({
          portal: 'junction',
          ...persistedTask,
          accepted_at: acceptedAt,
          matched_rule: matched.name,
          status: matched.action === 'accept' ? 'accepted' : 'rejected',
          sheets_synced: false,
        });

        // Mirror Symfonie: every rule-accepted task gets a Project record + webhook fire.
        // Without this, junction-accepted tasks never reach the BMS pipeline.
        if (matched.action === 'accept') {
          try {
            const project = await base44.asServiceRole.entities.Project.create({
              tenant_id: 'default',
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
            base44.asServiceRole.functions.invoke('dispatchWebhook', {
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

    await base44.asServiceRole.entities.Portal.filter({ key: 'junction' }).then(async (rows) => {
      if (rows[0]) {
        await base44.asServiceRole.entities.Portal.update(rows[0].id, {
          last_sync_at: new Date().toISOString(),
        });
      }
    });

    // Batch sheet sync — single source of truth for column mapping + routing.
    if (summary.accepted > 0) {
      base44.asServiceRole.functions.invoke('sheetsSyncPending', {})
        .catch((e) => console.error('sheetsSyncPending trigger failed:', e.message));
    }

    return Response.json({
      success: true,
      summary,
      details,
      total_offers: offers.length,
      ...(fetchErrors.length > 0 ? { partial_fetch_errors: fetchErrors } : {}),
    });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});