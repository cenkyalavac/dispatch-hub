// Cron-driven poller (every 5 min). Fetches Available submissions from GlobalLink PD
// and upserts them into GlobalLinkSubmission. One submission can expand into multiple
// language pairs; we write one row per (submission_ticket, target_language).
//
// Auth: pulls JWT from the CachedToken entity via getGlobalLinkToken — never reads
// GLOBALLINK_JWT env var directly so the broker stays the single source of truth.
//
// Kill switch: respects Portal(key='globallink').is_active — same pattern as
// symfonieProcessTasks/junctionProcessOffers.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const DEFAULT_BASE = 'https://gle-prod-eu.transperfect.com/PD';
const FOLDER = 'AVAILABLE_SUBMISSION';

// PD .pd endpoints require BOTH Bearer JWT and `csrfToken` header.
// Broker pushes both into CachedToken (keys: globallink_jwt, globallink_csrf).
function buildHeaders(jwt, contextUser, csrf) {
  const h = {
    'Authorization': `Bearer ${jwt}`,
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    'ajaxRequest': 'true',
    'appVersion': '11.5.0',
    'contextUser': contextUser,
  };
  if (csrf) h['csrfToken'] = csrf;
  return h;
}

async function fetchSubmissions(base, headers) {
  const res = await fetch(`${base}/submissionTargetSearch.pd`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ folder: FOLDER, entityTickets: [], parentEntityTickets: [], index: 0, size: 50 }),
  });
  if (!res.ok) throw new Error(`submissionTargetSearch.pd HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return data?.items || [];
}

async function fetchLanguagePairs(base, headers, submissionTicket) {
  const res = await fetch(`${base}/submissionLanguageSearch.pd`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ submissionTicket, folder: FOLDER }),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data?.items || [];
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

    // Get JWT from cache via the helper function
    const tokenRes = await base44.asServiceRole.functions.invoke('getGlobalLinkToken', {});
    if (!tokenRes?.data?.token_value) {
      return Response.json({ success: false, error: tokenRes?.data?.error || 'No cached GlobalLink JWT available' }, { status: 503 });
    }
    const jwt = tokenRes.data.token_value;
    const csrf = tokenRes.data.csrf_value || null;

    const contextUser = Deno.env.get('GLOBALLINK_CONTEXT_USER') || 'VerbatoTrans';
    const base = (Deno.env.get('GLOBALLINK_BASE_URL') || DEFAULT_BASE).replace(/\/$/, '');
    const headers = buildHeaders(jwt, contextUser, csrf);

    const submissions = await fetchSubmissions(base, headers);
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
        fetchLanguagePairs(base, headers, s.ticket).then((items) => ({ s, items }))
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
          if (!row.target_language) continue; // skip language-less rows; the API guarantees at least one when claimable
          const key = `${row.submission_ticket}::${row.target_language}`;
          const prior = existingKey.get(key);
          try {
            if (prior) {
              // Don't overwrite a claimed/skipped row — only refresh metadata on still-available ones.
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

    // Stamp last sync on the portal so the UI shows freshness.
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