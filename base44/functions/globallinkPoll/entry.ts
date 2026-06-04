// Cron-driven poller (every 5 min). Fetches Available submissions from GlobalLink PD
// and upserts them into GlobalLinkSubmission. One submission can expand into multiple
// language pairs; we write one row per (submission_ticket, target_language).
//
// All PD calls now go through the broker's /proxy/pd endpoint — the broker holds
// the live browser session (cookie + JWT + CSRF) and executes the fetch from its
// page context. Hub stays a pure orchestrator.
//
// Kill switch: respects Portal(key='globallink').is_active.

// Poll GlobalLink AVAILABLE pool and upsert GlobalLinkSubmission rows with
// per-target-locale leverage bands + WWC.
//
// FULL API REFERENCE: docs/globallink-api.md
//   §6.3  submissionView.pd  (12-band cumulativeTmStatistics, lowercase TARGET locale)
//   §7.2  leverage breakdown recipe

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const FOLDER = 'AVAILABLE_SUBMISSION';

// Inline leverage helpers (no local imports allowed in functions).
// Keeps each of the 12 PD bands as a separate field — fuzzy and reps are NOT
// merged at ingest time. WWC formula (MTPE-aligned, per Cenk):
//   (95-99 + Reps95-99) * 0.2
// + (85-94 + Reps85-94) * 0.35
// + (75-84 + Reps75-84) * 0.45
// + (50-74 + Reps50-74 + noMatch) * 0.6
// Context / pure-rep / 100% bands carry weight 0 (free under MTPE).
function _num(v) { return Number(v) || 0; }
function _bandKey(name) {
  const n = String(name || '').toLowerCase().replace(/\s+/g, '');
  if (n === 'incontextmatch') return 'context';
  if (n === 'repetitions') return 'rep';
  if (n === 'match100') return 'match100';
  if (n === '95%-99%') return 'f9599';
  if (n === '85%-94%') return 'f8594';
  if (n === '75%-84%') return 'f7584';
  if (n === '50%-74%') return 'f5074';
  if (n === 'reps95%-99%') return 'rep_9599';
  if (n === 'reps85%-94%') return 'rep_8594';
  if (n === 'reps75%-84%') return 'rep_7584';
  if (n === 'reps50%-74%') return 'rep_5074';
  if (n === 'nomatch') return 'no_match';
  return null;
}
function normalizeLeverage(cumulativeTmStatistics) {
  const out = {
    context: 0, rep: 0, match100: 0,
    f9599: 0, f8594: 0, f7584: 0, f5074: 0,
    rep_9599: 0, rep_8594: 0, rep_7584: 0, rep_5074: 0,
    no_match: 0,
  };
  if (!Array.isArray(cumulativeTmStatistics)) return out;
  for (const b of cumulativeTmStatistics) {
    const k = _bandKey(b?.name);
    if (k) out[k] += _num(b.wordCount);
  }
  return out;
}
function computeWwc(lev) {
  if (!lev) return 0;
  return Math.round(
      (_num(lev.f9599) + _num(lev.rep_9599)) * 0.2
    + (_num(lev.f8594) + _num(lev.rep_8594)) * 0.35
    + (_num(lev.f7584) + _num(lev.rep_7584)) * 0.45
    + (_num(lev.f5074) + _num(lev.rep_5074) + _num(lev.no_match)) * 0.6
  );
}

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

    const summary = { upserted: 0, created: 0, updated: 0, errors: 0, retired: 0 };

    // Reconciliation set — every (submission_ticket, target_language) we see in
    // *this* poll. Anything currently `available` in the DB that's NOT in this
    // set was either claimed by someone else, expired, or pulled by GlobalLink.
    // We mark those rows `skipped` so the Available Submissions table reflects
    // ground truth instead of a growing log.
    const seenKeys = new Set();

    // Expand language pairs in small parallel batches
    const BATCH = 5;
    for (let i = 0; i < submissions.length; i += BATCH) {
      const slice = submissions.slice(i, i + BATCH);
      const pairs = await Promise.all(slice.map((s) =>
        pdProxy(brokerUrl, brokerKey, 'submissionLanguageSearch.pd', { submissionTicket: s.ticket, folder: FOLDER })
          // Broker now returns a single object with top-level languageDirectionPreview
          // (one language-pair per response). Old format used items[]; support both.
          .then((d) => {
            if (Array.isArray(d?.items) && d.items.length > 0) return { s, items: d.items };
            if (d?.languageDirectionPreview) return { s, items: [d] };
            return { s, items: [] };
          })
          .catch(() => ({ s, items: [] }))
      ));

      for (const { s, items } of pairs) {
        // Vendor language names from submissionTargetSearch.pd (one-time per submission).
        const vendorLangs = Array.from(new Set(
          (s.vendorInfos || []).flatMap((v) => v.targetLanguages || [])
        ));

        // Build base rows (one per language pair) without leverage yet.
        const baseRows = (items && items.length > 0)
          ? items.map((it) => {
              const ldp = it.languageDirectionPreview || {};
              const srcLoc = it.sourceLanguage?.locale || ldp.sourceLanguage?.locale || s.sourceLocale || '';
              const tgtLoc = it.targetLanguage?.locale || ldp.targetLanguage?.locale || '';
              // Deadline from subPhaseStatusDataHolders[0].phaseStatusData[0].phaseDueDate.date (epoch ms).
              const phaseDue = it.subPhaseStatusDataHolders?.[0]?.phaseStatusData?.[0]?.phaseDueDate?.date
                ?? it.phaseStatusData?.[0]?.phaseDueDate?.date
                ?? it.phaseDueDate
                ?? null;
              // Coerce phaseDue (epoch ms | {date: epochMs} | ISO string | null)
              // → ISO string. Falls back to submission-level dueDate when phase-
              // level isn't populated. The previous ternary had ambiguous operator
              // precedence and could pass a raw epoch number through unchanged.
              const _coerceDue = (v) => {
                if (v == null) return null;
                if (typeof v === 'number') return new Date(v).toISOString();
                if (typeof v === 'object' && v.date) return new Date(v.date).toISOString();
                if (typeof v === 'string') {
                  const d = new Date(v);
                  return isNaN(d.getTime()) ? null : d.toISOString();
                }
                return null;
              };
              const dueIso = _coerceDue(phaseDue) || _coerceDue(s.dueDate);
              const phaseName = it.subPhaseStatusDataHolders?.[0]?.phaseStatusData?.[0]?.phaseName
                            || it.phaseStatusData?.[0]?.phaseName || '';
              const workflowName = it.subPhaseStatusDataHolders?.[0]?.workflow || it.workflow || '';
              // Account / client resolution — PD exposes the Project Account under
              // `paClientName` + `paClientTicket`. These are the authoritative
              // identifiers for a submission's owning account (clientName /
              // organizationName are usually empty for Available submissions).
              return {
                submission_ticket: s.ticket,
                submission_id: String(s.submissionId ?? ''),
                submission_name: s.submissionName || '',
                client_name: s.paClientName || s.clientName || s.organizationName || '',
                account_id: s.paClientTicket || '',
                project_name: s.projectName || '',
                source_language: srcLoc,
                target_language: tgtLoc,
                word_count: Number(s.wordCount) || 0,
                due_date: dueIso,
                deadline_at: dueIso,
                phase_name: phaseName,
                workflow_name: workflowName,
                vendor_languages: vendorLangs,
                _raw_lang: it,
              };
            })
          : [];

        // Fetch leverage per target locale via submissionView.pd.
        // sourceLanguageComboBox is misleadingly named — it's actually the TARGET locale filter.
        const rows = await Promise.all(baseRows.map(async (r) => {
          if (!r.target_language) return r;
          try {
            const view = await pdProxy(brokerUrl, brokerKey, 'submissionView.pd', {
              classifier: 'Batch1',
              folder: FOLDER,
              submissionTicket: r.submission_ticket,
              sourceLanguageComboBox: r.target_language.toLowerCase(),
              index: 0, size: 50,
            });
            const addl = view?.additionalData || view?.aditionalData || {};
            const lev = normalizeLeverage(addl.cumulativeTmStatistics);
            return {
              ...r,
              lev_context: lev.context,
              lev_rep: lev.rep,
              lev_match100: lev.match100,
              lev_9599: lev.f9599,
              lev_8594: lev.f8594,
              lev_7584: lev.f7584,
              lev_5074: lev.f5074,
              lev_rep_9599: lev.rep_9599,
              lev_rep_8594: lev.rep_8594,
              lev_rep_7584: lev.rep_7584,
              lev_rep_5074: lev.rep_5074,
              lev_no_match: lev.no_match,
              weighted_wc: computeWwc(lev),
              raw: { submission: s, language: r._raw_lang, view_summary: addl.cumulativeTmStatistics || null },
            };
          } catch (e) {
            console.error(`submissionView.pd failed for ${r.submission_id}/${r.target_language}:`, e.message);
            return { ...r, raw: { submission: s, language: r._raw_lang } };
          }
        }));

        for (const r of rows) { delete r._raw_lang; }

        for (const row of rows) {
          if (!row.target_language) continue;
          const key = `${row.submission_ticket}::${row.target_language}`;
          seenKeys.add(key);
          const prior = existingKey.get(key);
          let isNew = false;
          try {
            if (prior) {
              if (prior.status && prior.status !== 'available') continue;
              await base44.asServiceRole.entities.GlobalLinkSubmission.update(prior.id, row);
              summary.updated++;
            } else {
              await base44.asServiceRole.entities.GlobalLinkSubmission.create({ ...row, status: 'available' });
              summary.created++;
              isNew = true;
            }
            summary.upserted++;
          } catch (e) {
            console.error('GlobalLinkSubmission upsert failed:', e.message);
            summary.errors++;
          }

          // NOTE: per-row notifyNewTask used to fire here. It's now owned by
          // globallinkProcessSubmissions, which runs the rule engine first and
          // only notifies when NO rule matches — preventing double-mailing.
          void isNew;
        }
      }
    }

    // Reconcile: retire rows that used to be available but aren't in this poll.
    // We only touch status='available' — claimed/skipped/error rows stay as-is.
    //
    // GRACE PERIOD (10 min): PD's AVAILABLE pool is volatile — a submission
    // can briefly disappear from one poll and reappear on the next (paging
    // boundary, transient PD load, dynamic re-ordering). Previously we
    // retired on the FIRST miss, which broke the email one-click Accept flow:
    // a notification mailed at T+0 could find its underlying row marked
    // "skipped" by T+5min, so the recipient's click hit a 410 Gone.
    // 10 minutes covers a single missed 5-min poll cycle and gives the
    // recipient a realistic window to act on the email.
    const retiredAt = new Date().toISOString();
    const retireCutoff = Date.now() - 10 * 60 * 1000;
    for (const r of existing) {
      if (r.status !== 'available') continue;
      const key = `${r.submission_ticket}::${r.target_language || ''}`;
      if (seenKeys.has(key)) continue;
      // Created in the last 10 minutes? Skip — give the recipient time.
      const createdMs = r.created_date ? new Date(r.created_date).getTime() : 0;
      if (createdMs && createdMs > retireCutoff) continue;
      try {
        await base44.asServiceRole.entities.GlobalLinkSubmission.update(r.id, {
          status: 'skipped',
          claim_error: `Auto-retired: not in available pool at ${retiredAt}`,
        });
        summary.retired++;
      } catch (e) {
        console.error('Retire failed for', r.id, e.message);
        summary.errors++;
      }
    }

    if (portal?.id) {
      await base44.asServiceRole.entities.Portal.update(portal.id, { last_sync_at: new Date().toISOString() }).catch(() => null);
    }

    console.log(`globallinkPoll done: created=${summary.created} updated=${summary.updated} retired=${summary.retired} errors=${summary.errors}`);

    // Happy-path auto-resolve: any open poll_failure for this portal is now stale.
    base44.functions.invoke('resolveSystemIssues', { type: 'poll_failure', portal: 'globallink' })
      .catch((e) => console.error('resolveSystemIssues failed:', e.message));

    return Response.json({ success: true, summary, total_submissions: submissions.length });
  } catch (error) {
    console.error('globallinkPoll error:', error.message);
    // Visibility: a broken poll silently means "no new offers seen". Record an
    // issue so an operator notices broker/PD/cron failures before they cost
    // us submissions. Auto-resolves on the next successful run.
    try {
      // Broker-side Chromium crash detection. The broker's /proxy/pd surfaces
      // Playwright errors verbatim — when the headless tab OOMs or the
      // renderer process dies, the error string carries one of these
      // signatures. Treat those as critical (page-level alarm + email to
      // admins) rather than the generic "poll failed" warning, since they
      // mean GlobalLink is going to stay dark until someone restarts the
      // broker container. Separate dedup_key so the critical issue doesn't
      // collide with the routine poll_failure row.
      const msg = String(error.message || '');
      const isBrokerCrash =
        /target\s*crashed/i.test(msg) ||
        /page\.evaluate.*crashed/i.test(msg) ||
        /renderer.*crashed/i.test(msg) ||
        /browser.*disconnected/i.test(msg);
      const b = createClientFromRequest(req);
      b.functions.invoke('recordSystemIssue', {
        type: 'poll_failure',
        severity: isBrokerCrash ? 'critical' : 'warning',
        portal: 'globallink',
        function_name: 'globallinkPoll',
        dedup_key: isBrokerCrash ? 'broker_crash' : 'poll',
        title: isBrokerCrash
          ? 'GlobalLink broker crashed (Chromium OOM / renderer dead)'
          : 'GlobalLink poll failed',
        description: isBrokerCrash
          ? `Broker's headless browser is down — every PD call will fail until the Railway broker container is restarted. Raw error:\n\n${msg}`
          : msg,
      }).catch((e) => console.error('recordSystemIssue failed:', e.message));
    } catch { /* never let issue recording mask the original error */ }
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});