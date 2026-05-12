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

async function acceptOffer(apiBase, jwt, apiKey, offerId) {
  const r = await fetch(`${apiBase}/v1/offer/accept-bulk`, {
    method: 'PUT',
    headers: authHeaders(jwt, apiKey, true),
    body: JSON.stringify({ ids: [Number(offerId)] }),
  });
  return r.ok;
}

async function rejectOffer(apiBase, jwt, apiKey, offerId, reason = 'capacity') {
  const r = await fetch(`${apiBase}/v1/offer/${offerId}/reject`, {
    method: 'PUT',
    headers: authHeaders(jwt, apiKey, true),
    body: JSON.stringify({ reasons: [{ reasonCategory: reason, reasonExplanation: null }] }),
  });
  return r.ok;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const jwt = Deno.env.get('JUNCTION_JWT');
    const apiKey = Deno.env.get('JUNCTION_API_KEY');
    const apiBase = Deno.env.get('JUNCTION_API_BASE') || PROD_BASE;
    if (!jwt) return Response.json({ success: false, error: 'JUNCTION_JWT not configured' });

    // 1. Fetch offers (paginated)
    const offers = [];
    let offset = 0;
    while (true) {
      const r = await fetch(`${apiBase}/v2/offer/me?limit=25&offset=${offset}`, {
        headers: authHeaders(jwt, apiKey),
      });
      if (!r.ok) return Response.json({ success: false, error: `Junction HTTP ${r.status}` });
      const page = await r.json();
      const arr = Array.isArray(page) ? page : (page?.data || []);
      offers.push(...arr);
      if (arr.length < 25) break;
      offset += 25;
      if (offset > 500) break;
    }

    // 2. Get active rules for junction
    const rules = (await base44.asServiceRole.entities.Rule.filter({ is_active: true, portal: 'junction' }))
      .sort((a, b) => (a.priority || 1) - (b.priority || 1));

    // 3. Skip already-processed
    const processedIds = new Set((await base44.asServiceRole.entities.AcceptedTask.filter({ portal: 'junction' }, '-created_date', 2000))
      .map(t => Number(t.task_id)));

    const summary = { accepted: 0, rejected: 0, skipped: 0, errors: 0 };
    const details = { accepted: [], rejected: [], skipped: [], errors: [] };

    for (const offer of offers) {
      if (processedIds.has(Number(offer.id))) continue;
      const td = offer.taskDetail || offer.task || {};
      const project = td.project || offer.project || {};
      const task = {
        task_id: offer.id,
        task_name: td.name || `Offer #${offer.id}`,
        project_name: project.name || td.projectName || '',
        client_name: project.client?.name || '',
        source_language: td.sourceLocale || td.sourceLanguage || '',
        target_language: td.targetLocale || td.targetLanguage || '',
        word_count: td.wordCount || 0,
        price: offer.amount || td.amount || 0,
        due_date: offer.dueDate || td.dueDate || null,
      };

      const matched = rules.find(r => matchesRule(task, r));
      if (!matched) {
        summary.skipped++;
        details.skipped.push({ id: offer.id, name: task.task_name, source_language: task.source_language, target_language: task.target_language, project_name: task.project_name });
        continue;
      }

      try {
        const ok = matched.action === 'accept'
          ? await acceptOffer(apiBase, jwt, apiKey, offer.id)
          : await rejectOffer(apiBase, jwt, apiKey, offer.id);

        if (!ok) {
          summary.errors++;
          details.errors.push({ id: offer.id, error: 'API call failed' });
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
              external_id: `junction:${offer.id}`,
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
            console.error(`Project create failed for offer ${offer.id}:`, e.message);
          }
          summary.accepted++;
          details.accepted.push(task.task_name);
        } else {
          summary.rejected++;
          details.rejected.push(task.task_name);
        }
      } catch (err) {
        summary.errors++;
        details.errors.push({ id: offer.id, error: err.message });
      }
    }

    await base44.asServiceRole.entities.Portal.filter({ key: 'junction' }).then(async (rows) => {
      if (rows[0]) {
        await base44.asServiceRole.entities.Portal.update(rows[0].id, {
          last_sync_at: new Date().toISOString(),
        });
      }
    });

    return Response.json({ success: true, summary, details, total_offers: offers.length });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});