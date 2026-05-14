// Cron-driven poller (every 5 min). Fetches Available submissions from GlobalLink PD
// and upserts them into GlobalLinkSubmission. One submission can expand into multiple
// language pairs; we write one row per (submission_ticket, target_language).
//
// All PD calls now go through the broker's /proxy/pd endpoint — the broker holds
// the live browser session (cookie + JWT + CSRF) and executes the fetch from its
// page context. Hub stays a pure orchestrator.
//
// Kill switch: respects Portal(key='globallink').is_active.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const FOLDER = 'AVAILABLE_SUBMISSION';

async function pdProxy(brokerUrl, brokerKey, endpoint, body) {
  const res = await fetch(`${brokerUrl}/proxy/pd`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Broker-Key': brokerKey,
    },
    body: JSON.stringify({ endpoint, body }),
  });
  const text = await res.text();
  let payload;
  try { payload = JSON.parse(text); } catch { payload = { error: text.slice(0, 200) }; }
  if (!res.ok) {
    throw new Error(`Broker proxy HTTP ${res.status}: ${payload?.error || text.slice(0, 200)}`);
  }
  const pdStatus = payload?.status ?? 200;
  // Broker envelope evolved to { status, bodyJson, bodyText, ... } — keep
  // backwards compat with older { status, body } shape.
  const pdBody = payload?.bodyJson ?? payload?.body ?? payload;
  if (pdStatus >= 400) {
    throw new Error(`PD ${endpoint} HTTP ${pdStatus}: ${pdBody?.description || pdBody?.reasons || JSON.stringify(pdBody).slice(0, 200)}`);
  }
  return pdBody;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Soft auth: scheduled/system calls have no user context.
    const user = await base44.auth.me().catch(() => null);
    if (user !== null && user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Kill switch
    const portalRows = await base44.asServiceRole.entities.Portal.filter({ key: 'globallink' });
    const portal = portalRows[0] || null;
    if (portal && portal.is_active === false) {
      console.log('globallinkPoll skipped: portal is_active=false');
      return Response.json({ success: true, skipped: true, reason: 'Portal disabled', summary: { upserted: 0 } });
    }

    const brokerUrl = (Deno.env.get('BROKER_URL') || '').replace(/\/$/, '');
    const brokerKey = Deno.env.get('BROKER_KEY');
    if (!brokerUrl || !brokerKey) {
      return Response.json({ success: false, error: 'BROKER_URL or BROKER_KEY secret missing' }, { status: 503 });
    }

    const listData = await pdProxy(brokerUrl, brokerKey, 'submissionTargetSearch.pd', {
      folder: FOLDER, entityTickets: [], parentEntityTickets: [], index: 0, size: 50,
    });
    const submissions = listData?.items || [];
    console.log(`globallinkPoll: ${submissions.length} available submissions from PD`);

    // Existing rows keyed by submission_ticket + target_language so we don't duplicate.
    const existing = await base44.asServiceRole.entities.GlobalLinkSubmission.list('-created_date', 2000);
    const existingKey = new Map(
      existing.map((r) => [`${r.submission_ticket}::${r.target_language || ''}`, r])
    );

    const summary = { upserted: 0, created: 0, updated: 0, errors: 0 };

    // Expand language pairs in small parallel batches
    const BATCH = 5;
    for (let i = 0; i < submissions.length; i += BATCH) {
      const slice = submissions.slice(i, i + BATCH);
      const pairs = await Promise.all(slice.map((s) =>
        pdProxy(brokerUrl, brokerKey, 'submissionLanguageSearch.pd', { submissionTicket: s.ticket, folder: FOLDER })
          .then((d) => ({ s, items: d?.items || [] }))
          .catch(() => ({ s, items: [] }))
      ));

      for (const { s, items } of pairs) {
        const rows = (items && items.length > 0)
          ? items.map((it) => ({
              submission_ticket: s.ticket,
              submission_id: String(s.submissionId ?? ''),
              submission_name: s.submissionName || '',
              client_name: s.clientName || s.organizationName || '',
              source_language: it.sourceLanguage?.locale || s.sourceLocale || '',
              target_language: it.targetLanguage?.locale || '',
              word_count: Number(it.wordCount) || Number(s.wordCount) || 0,
              due_date: it.phaseDueDate || s.dueDate || null,
              raw: { submission: s, language: it },
            }))
          : [{
              submission_ticket: s.ticket,
              submission_id: String(s.submissionId ?? ''),
              submission_name: s.submissionName || '',
              client_name: s.clientName || s.organizationName || '',
              source_language: s.sourceLocale || s.sourceLanguage || '',
              target_language: '',
              word_count: Number(s.wordCount) || 0,
              due_date: s.dueDate || null,
              raw: s,
            }];

        for (const row of rows) {
          if (!row.target_language) continue;
          const key = `${row.submission_ticket}::${row.target_language}`;
          const prior = existingKey.get(key);
          try {
            if (prior) {
              if (prior.status && prior.status !== 'available') continue;
              await base44.asServiceRole.entities.GlobalLinkSubmission.update(prior.id, row);
              summary.updated++;
            } else {
              await base44.asServiceRole.entities.GlobalLinkSubmission.create({ ...row, status: 'available' });
              summary.created++;
            }
            summary.upserted++;
          } catch (e) {
            console.error('GlobalLinkSubmission upsert failed:', e.message);
            summary.errors++;
          }
        }
      }
    }

    if (portal?.id) {
      await base44.asServiceRole.entities.Portal.update(portal.id, { last_sync_at: new Date().toISOString() }).catch(() => null);
    }

    console.log(`globallinkPoll done: created=${summary.created} updated=${summary.updated} errors=${summary.errors}`);
    return Response.json({ success: true, summary, total_submissions: submissions.length });
  } catch (error) {
    console.error('globallinkPoll error:', error.message);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});