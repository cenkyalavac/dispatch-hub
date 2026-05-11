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

async function acceptOffer(apiBase, jwt, offerId) {
  const r = await fetch(`${apiBase}/v1/offer/accept-bulk`, {
    method: 'PUT',
    headers: { 'x-pantheon-auth': jwt, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: [Number(offerId)] }),
  });
  return r.ok;
}

async function rejectOffer(apiBase, jwt, offerId, reason = 'capacity') {
  const r = await fetch(`${apiBase}/v1/offer/${offerId}/reject`, {
    method: 'PUT',
    headers: { 'x-pantheon-auth': jwt, 'Content-Type': 'application/json' },
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
    const apiBase = Deno.env.get('JUNCTION_API_BASE') || PROD_BASE;
    if (!jwt) return Response.json({ success: false, error: 'JUNCTION_JWT not configured' });

    // 1. Fetch offers (paginated)
    const offers = [];
    let offset = 0;
    while (true) {
      const r = await fetch(`${apiBase}/v2/offer/me?limit=25&offset=${offset}`, {
        headers: { 'x-pantheon-auth': jwt },
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
    const rules = (await base44.entities.Rule.filter({ is_active: true, portal: 'junction' }))
      .sort((a, b) => (a.priority || 1) - (b.priority || 1));

    // 3. Skip already-processed
    const processedIds = new Set((await base44.entities.AcceptedTask.filter({ portal: 'junction' }))
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
          ? await acceptOffer(apiBase, jwt, offer.id)
          : await rejectOffer(apiBase, jwt, offer.id);

        if (!ok) {
          summary.errors++;
          details.errors.push({ id: offer.id, error: 'API call failed' });
          continue;
        }

        await base44.entities.AcceptedTask.create({
          portal: 'junction',
          ...task,
          accepted_at: new Date().toISOString(),
          matched_rule: matched.name,
          status: matched.action === 'accept' ? 'accepted' : 'rejected',
          sheets_synced: false,
        });

        if (matched.action === 'accept') { summary.accepted++; details.accepted.push(task.task_name); }
        else { summary.rejected++; details.rejected.push(task.task_name); }
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