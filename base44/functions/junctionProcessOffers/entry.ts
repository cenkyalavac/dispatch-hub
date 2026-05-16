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

    // 1. Fetch offers — endpoint returns the full list; query params are rejected.
    const offersRes = await fetch(`${apiBase}/v2/offer/me`, {
      headers: authHeaders(jwt, apiKey),
    });
    if (!offersRes.ok) {
      const text = await offersRes.text();
      return Response.json(
        { success: false, error: `Junction HTTP ${offersRes.status}: ${text.slice(0, 200)}` },
        { status: 502 }
      );
    }
    const offersData = await offersRes.json();
    const offers = Array.isArray(offersData) ? offersData : (offersData?.data || []);

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
      const task = {
        task_id: offerId,
        task_name: td.name || offer.taskLabel || `Offer #${offerId}`,
        project_name: project.name || td.projectName || offer.programLabel || offer.projectName || '',
        client_name: project.client?.name || project.clientName || offer.accountName || offer.companyName || '',
        source_language: td.sourceLocale || td.sourceLanguage || offer.sourceLocale || '',
        target_language: td.targetLocale || td.targetLanguage || offer.targetLocale || '',
        // taskLabel does not have a wordCount equivalent in flat shape — weightedWordCount
        // is the closest signal; unitQuantityTotal is words for word-priced tasks.
        word_count: td.wordCount || offer.weightedWordCount || offer.unitQuantityTotal || 0,
        // Flat uses `subtotal` for the line total (USD); nested uses `amount`.
        price: offer.amount || td.amount || offer.subtotal || 0,
        due_date: offer.dueDate || td.dueDate || null,
        workflow_name: td.workflow || td.workflowName || offer.taskLabel || '',
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
        const savedTask = await base44.asServiceRole.entities.AcceptedTask.create({
          portal: 'junction',
          ...task,
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

    return Response.json({ success: true, summary, details, total_offers: offers.length });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});