// Approve a single GlobalLinkSubmission — the UI action handler.
//
// All PD calls go through broker /proxy/pd (page-context fetch).
//
// FULL API REFERENCE: docs/globallink-api.md  (§7.1 — 6-step claim chain)
// The inline claim chain below mirrors functions/globallinkClaim.runClaimChain
// — keep both in sync when the PD contract changes.
//
// Critical orchestration (in order — DO NOT reorder):
//   1. Fresh-ticket fetch: submissionTargetSearch.pd → match by submissionId.
//   2. submissionLanguageSearch.pd → enumerate target locales.
//   3. Locale-family intersection: Portal.allowed_language_families.
//   4. globallinkClaim with the matched locales.
//   5. Flip matching DB rows to status=claimed.
//   6. Create one AcceptedTask + Project per claimed language → fire webhook.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function localeMatchesFamily(locale, family) {
  if (!locale || !family) return false;
  const loc = String(locale).toLowerCase();
  const fam = String(family).toLowerCase();
  return loc === fam || loc.startsWith(fam + '-') || loc.startsWith(fam + '_');
}

function filterLocalesByFamilies(locales, families) {
  if (!Array.isArray(families) || families.length === 0) return locales;
  return locales.filter((loc) => families.some((fam) => localeMatchesFamily(loc, fam)));
}

async function pdProxy(brokerUrl, brokerKey, endpoint, body) {
  const res = await fetch(`${brokerUrl}/proxy/pd`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Broker-Key': brokerKey },
    body: JSON.stringify({ endpoint, body }),
  });
  const text = await res.text();
  let payload;
  try { payload = JSON.parse(text); } catch { payload = { error: text.slice(0, 200) }; }
  if (!res.ok) throw new Error(`Broker proxy HTTP ${res.status}: ${payload?.error || text.slice(0, 200)}`);
  const pdStatus = payload?.status ?? 200;
  // Broker envelope evolved to { status, bodyJson, bodyText, ... } — keep
  // backwards compat with older { status, body } shape.
  const pdBody = payload?.bodyJson ?? payload?.body ?? payload;
  if (pdStatus >= 400) throw new Error(`PD ${endpoint} HTTP ${pdStatus}: ${pdBody?.description || pdBody?.reasons || JSON.stringify(pdBody).slice(0, 200)}`);
  return pdBody;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (user !== null && user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { submission_row_id, submission_ticket: tktFallback } = body || {};
    if (!submission_row_id && !tktFallback) {
      return Response.json({ success: false, error: 'submission_row_id or submission_ticket is required' }, { status: 400 });
    }

    // Primary lookup by row id; if the UI is stale (row deleted), fall back to
    // ticket-based lookup so the user can still claim.
    let row = submission_row_id
      ? await base44.asServiceRole.entities.GlobalLinkSubmission.get(submission_row_id).catch(() => null)
      : null;
    if (!row && tktFallback) {
      const tktRows = await base44.asServiceRole.entities.GlobalLinkSubmission
        .filter({ submission_ticket: tktFallback })
        .catch(() => []);
      row = tktRows.find((r) => r.status === 'available') || tktRows[0] || null;
    }
    if (!row) {
      return Response.json({
        success: false,
        error: 'Submission no longer in this hub. The list is out of date — please refresh.',
      }, { status: 404 });
    }
    if (row.status === 'claimed') {
      return Response.json({ success: true, already: true, message: 'Already claimed' });
    }

    const brokerUrl = (Deno.env.get('BROKER_URL') || '').replace(/\/$/, '');
    const brokerKey = Deno.env.get('BROKER_KEY');
    if (!brokerUrl || !brokerKey) {
      return Response.json({ success: false, error: 'BROKER_URL or BROKER_KEY secret missing' }, { status: 503 });
    }

    // 1) FRESH TICKET — match by submissionId.
    const submissionIdRaw = row.submission_id;
    const listData = await pdProxy(brokerUrl, brokerKey, 'submissionTargetSearch.pd', {
      folder: 'AVAILABLE_SUBMISSION', entityTickets: [], parentEntityTickets: [], index: 0, size: 100,
    });
    const items = listData?.items || [];
    const fresh = items.find((s) => String(s.submissionId) === String(submissionIdRaw))
      || items.find((s) => s.ticket === row.submission_ticket);
    if (!fresh) {
      await base44.asServiceRole.entities.GlobalLinkSubmission.update(row.id, {
        status: 'skipped',
        claim_error: 'No longer in Available (claimed elsewhere or expired)',
      });
      return Response.json({
        success: false,
        error: `Submission ${submissionIdRaw} no longer in Available (claimed elsewhere or expired)`,
      }, { status: 410 });
    }
    const freshTicket = fresh.ticket;

    // 2) Enumerate target locales.
    const langData = await pdProxy(brokerUrl, brokerKey, 'submissionLanguageSearch.pd', {
      submissionTicket: freshTicket, folder: 'AVAILABLE_SUBMISSION',
    });
    const availableItems = langData?.items || [];
    const availableLocales = availableItems
      .map((i) => i?.languageDirectionPreview?.targetLanguage?.locale)
      .filter(Boolean);

    // 3) Locale-family intersection.
    const portalRows = await base44.asServiceRole.entities.Portal.filter({ key: 'globallink' });
    const portal = portalRows[0] || null;
    const families = portal?.allowed_language_families || [];
    // Client attribution: propagated onto every AcceptedTask + Project below
    // so BMS clients can filter by end-customer.
    const portalClientId = portal?.client_id || null;
    const claimable = filterLocalesByFamilies(availableLocales, families);

    if (claimable.length === 0) {
      return Response.json({
        success: false,
        error: 'No matching languages',
        available_in_submission: availableLocales,
        allowed_families: families,
        hint: 'Add the needed language family to Portal.allowed_language_families',
      }, { status: 409 });
    }

    // 4) Claim — inline 6-step chain (matches broker-verified flow for claim 0122458).
    //    Cross-function service invoke is rejected by the platform, so we duplicate
    //    the chain here. Keep this in sync with functions/globallinkClaim.
    const FOLDER = 'AVAILABLE_SUBMISSION';
    const TASK_NAME = 'claim.PostEdit';
    const SUCCESS_NEXT = 'process linguistic.PostEdit';
    let processUuid = null;
    let claimErr = null;
    let nextTaskName = null;

    try {
      // Step 1: submissionLanguageSearch.pd
      await pdProxy(brokerUrl, brokerKey, 'submissionLanguageSearch.pd', {
        submissionTicket: freshTicket, folder: FOLDER,
      });

      // Step 2: taskPost.pd (init) — extract processUuid.
      // Per docs/globallink-api.md §6.6, taskPost.pd returns processUuid under
      // taskInfos[0].model — NOT taskResponse.model (that one's for task.pd).
      // jsonTaskData here is minimal ({folder}) per §7.1 — targetLanguages
      // only appears starting at step 5 (the real task.pd).
      const s2 = await pdProxy(brokerUrl, brokerKey, 'taskPost.pd', {
        taskName: TASK_NAME,
        parentTickets: [freshTicket],
        jsonTaskData: JSON.stringify({ folder: FOLDER }),
      });
      processUuid = s2?.taskInfos?.[0]?.model?.processUuid
                 || s2?.taskResponse?.model?.processUuid
                 || s2?.model?.processUuid
                 || s2?.processUuid
                 || null;
      if (!processUuid) {
        claimErr = `Claim step 2 (taskPost.pd init) failed: no processUuid in response. body=${JSON.stringify(s2).slice(0, 300)}`;
      } else if (s2?.success === false) {
        claimErr = `Claim step 2 failed: ${s2.description || s2.desciption || JSON.stringify(s2.reasons || s2).slice(0, 200)}`;
      }

      // Step 3: taskPost.pd (dialog continue) — per §7.1, body is just
      // {processUuid, folder} — no targetLanguages yet.
      if (!claimErr) {
        const s3 = await pdProxy(brokerUrl, brokerKey, 'taskPost.pd', {
          taskName: TASK_NAME,
          parentTickets: [freshTicket],
          jsonTaskData: JSON.stringify({ processUuid, folder: FOLDER }),
        });
        if (s3?.success === false) {
          claimErr = `Claim step 3 failed: ${s3.description || s3.desciption || JSON.stringify(s3.reasons || s3).slice(0, 200)}`;
        }
      }

      // Step 4: submissionAvailableItemsLookup.pd — per §6.4 the body must
      // include taskName + phaseName (NOT processUuid / targetLanguages).
      if (!claimErr) {
        const s4 = await pdProxy(brokerUrl, brokerKey, 'submissionAvailableItemsLookup.pd', {
          folder: FOLDER,
          submissionTicket: freshTicket,
          taskName: TASK_NAME,
          phaseName: 'PostEdit',
          index: 0,
          size: 50,
        });
        if (s4?.success === false) {
          claimErr = `Claim step 4 failed: ${s4.description || s4.desciption || JSON.stringify(s4.reasons || s4).slice(0, 200)}`;
        }
      }

      // Step 5: task.pd (REAL claim init — language NOW selected).
      // Returns processUuid_B which threads into step 6.
      let processUuidB = null;
      if (!claimErr) {
        const s5 = await pdProxy(brokerUrl, brokerKey, 'task.pd', {
          taskName: TASK_NAME,
          parentTickets: [freshTicket],
          jsonTaskData: JSON.stringify({ folder: FOLDER, targetLanguages: claimable }),
        });
        console.log('globallinkApproveOne step5 response:', JSON.stringify(s5).slice(0, 800));
        if (s5?.success === false) {
          claimErr = `Claim step 5 failed: ${s5.description || s5.desciption || JSON.stringify(s5.reasons || s5).slice(0, 400)}`;
        } else {
          // Step 5 returns processUuid_B (per §7.1) — DIFFERENT from step 2's uuid.
          processUuidB = s5?.taskResponse?.model?.processUuid
                      || s5?.model?.processUuid
                      || s5?.taskInfos?.[0]?.model?.processUuid
                      || processUuid; // fallback: reuse A
        }
      }

      // Step 6: task.pd (REAL commit) — threads processUuid_B from step 5.
      // success iff nextTaskName === "process linguistic.PostEdit"
      if (!claimErr) {
        const s6 = await pdProxy(brokerUrl, brokerKey, 'task.pd', {
          taskName: TASK_NAME,
          parentTickets: [freshTicket],
          jsonTaskData: JSON.stringify({ processUuid: processUuidB, folder: FOLDER, targetLanguages: claimable }),
        });
        console.log('globallinkApproveOne step6 response:', JSON.stringify(s6).slice(0, 800));
        nextTaskName = s6?.taskResponse?.model?.nextTaskName || s6?.model?.nextTaskName || null;
        if (nextTaskName !== SUCCESS_NEXT) {
          claimErr = `Claim step 6 commit did not succeed: nextTaskName="${nextTaskName}" (expected "${SUCCESS_NEXT}"). body=${JSON.stringify(s6).slice(0, 300)}`;
        }
      }
    } catch (e) {
      claimErr = e.message;
    }

    if (claimErr) {
      await base44.asServiceRole.entities.GlobalLinkSubmission.update(row.id, {
        status: 'error', claim_error: claimErr,
      });
      return Response.json({ success: false, error: claimErr }, { status: 502 });
    }
    const claimData = { success: true, process_uuid: processUuid, next_task_name: nextTaskName };

    const acceptedAt = new Date().toISOString();
    const sameSubmissionRows = await base44.asServiceRole.entities.GlobalLinkSubmission
      .filter({ submission_ticket: row.submission_ticket });

    const created = [];

    for (const claimedLocale of claimable) {
      const matchRow = sameSubmissionRows.find(
        (r) => (r.target_language || '').toLowerCase() === claimedLocale.toLowerCase()
      ) || row;

      // Idempotency guard: same (submission_ticket, target_language) already
      // claimed — reuse the existing AcceptedTask. Happens when the UI's
      // Approve button is double-clicked or when a previous run failed
      // mid-Project-create and was retried. GlobalLink's claim chain on
      // re-run returns 4xx for "already claimed", which we treat as success
      // upstream — we just must not insert a duplicate row downstream.
      const existingAcceptedRows = await base44.asServiceRole.entities.AcceptedTask
        .filter({
          portal: 'globallink',
          submission_ticket: row.submission_ticket,
          target_language: claimedLocale,
        }, '-created_date', 1)
        .catch(() => []);
      const liveExistingAccepted = existingAcceptedRows.find((t) => t.status !== 'error') || null;

      // Copy GlobalLink-specific fields (12-band leverage, WWC, phase, workflow,
      // deadline, submission identity) onto the AcceptedTask so the Sheets sync
      // — which reads exclusively from AcceptedTask — can write them out as
      // configurable columns. Anything missing on the source row becomes a
      // null/zero on the destination; downstream code already handles that.
      //
      // Persist guard: GlobalLink has already claimed the submission at this
      // point. If AcceptedTask.create throws, the submission is claimed on PD
      // but invisible to us — CRITICAL. Record the issue and re-raise so the
      // calling UI sees the error; external_ref carries submission_ticket
      // plus the locale so an operator can manually reconcile per language.
      let acceptedTask;
      if (liveExistingAccepted) {
        console.log(`AcceptedTask for ${row.submission_ticket}/${claimedLocale} already exists (id=${liveExistingAccepted.id}) — skipping duplicate create.`);
        acceptedTask = liveExistingAccepted;
      } else {
      try {
      acceptedTask = await base44.asServiceRole.entities.AcceptedTask.create({
        portal: 'globallink',
        client_id: portalClientId,
        task_id: Number(matchRow.submission_id) || matchRow.submission_ticket,
        task_name: matchRow.submission_name || `Submission ${matchRow.submission_id || matchRow.submission_ticket}`,
        project_name: matchRow.project_name || matchRow.submission_name || '',
        client_name: matchRow.client_name || '',
        account_id: matchRow.account_id || '',
        source_language: matchRow.source_language || '',
        target_language: claimedLocale,
        word_count: matchRow.word_count || 0,
        price: 0,
        due_date: matchRow.due_date || null,
        accepted_at: acceptedAt,
        matched_rule: 'manual:approve',
        status: 'accepted',
        sheets_synced: false,
        // GlobalLink-specific payload
        submission_id: matchRow.submission_id || '',
        submission_ticket: matchRow.submission_ticket || '',
        weighted_wc: matchRow.weighted_wc ?? 0,
        lev_context:  matchRow.lev_context  ?? 0,
        lev_rep:      matchRow.lev_rep      ?? 0,
        lev_match100: matchRow.lev_match100 ?? 0,
        lev_9599:     matchRow.lev_9599     ?? 0,
        lev_8594:     matchRow.lev_8594     ?? 0,
        lev_7584:     matchRow.lev_7584     ?? 0,
        lev_5074:     matchRow.lev_5074     ?? 0,
        lev_rep_9599: matchRow.lev_rep_9599 ?? 0,
        lev_rep_8594: matchRow.lev_rep_8594 ?? 0,
        lev_rep_7584: matchRow.lev_rep_7584 ?? 0,
        lev_rep_5074: matchRow.lev_rep_5074 ?? 0,
        lev_no_match: matchRow.lev_no_match ?? 0,
        deadline_at:  matchRow.deadline_at  || null,
        phase_name:   matchRow.phase_name   || '',
        workflow_name: matchRow.workflow_name || '',
      });
      } catch (persistErr) {
        base44.functions.invoke('recordSystemIssue', {
          type: 'accept_persist_failure',
          severity: 'critical',
          portal: 'globallink',
          function_name: 'globallinkApproveOne',
          external_ref: `${row.submission_ticket}:${claimedLocale}`,
          dedup_key: `accept:${row.submission_ticket}:${claimedLocale}`,
          title: `GlobalLink submission ${row.submission_id || row.submission_ticket} claimed but persist failed (${claimedLocale})`,
          description: `Submission "${matchRow.submission_name || row.submission_ticket}" / ${claimedLocale} was claimed on GlobalLink PD successfully, but AcceptedTask.create threw: ${persistErr.message}\n\nThis submission/locale is now claimed on PD but invisible to the Hub. Recover by manually creating an AcceptedTask row with submission_ticket=${row.submission_ticket}, target_language=${claimedLocale}.`,
        }).catch((e) => console.error('recordSystemIssue failed:', e.message));
        throw persistErr;
      }
      }

      await base44.asServiceRole.entities.GlobalLinkSubmission.update(matchRow.id, {
        status: 'claimed',
        claimed_at: acceptedAt,
        accepted_task_id: acceptedTask.id,
        claim_error: null,
      }).catch((e) => console.error('row claim update failed:', e.message));

      // Idempotency: skip Project create + webhook when one exists for this
      // (ticket, locale). external_id encodes both so the filter is unique.
      const externalId = `globallink:${row.submission_ticket}:${claimedLocale}`;
      const existingProject = await base44.asServiceRole.entities.Project
        .filter({ external_id: externalId }, '-created_date', 1)
        .catch(() => []);
      if (existingProject.length > 0) {
        console.log(`Project ${externalId} already exists (id=${existingProject[0].id}) — skipping duplicate create + webhook.`);
      } else {
      try {
        const project = await base44.asServiceRole.entities.Project.create({
          tenant_id: 'default',
          client_id: portalClientId,
          accepted_task_id: acceptedTask.id,
          portal: 'globallink',
          external_id: `globallink:${row.submission_ticket}:${claimedLocale}`,
          state: 'accepted',
          name: matchRow.submission_name || '',
          client_name: matchRow.client_name || '',
          project_name: matchRow.submission_name || '',
          source_language: matchRow.source_language || '',
          target_language: claimedLocale,
          word_count: matchRow.word_count || 0,
          price: 0,
          currency: 'USD',
          due_date: matchRow.due_date || null,
          accepted_at: acceptedAt,
          origin: { submission_ticket: freshTicket, submission_id: matchRow.submission_id, raw: matchRow.raw || null },
        });
        base44.functions.invoke('dispatchWebhook', {
          tenant_id: 'default', event: 'project.accepted', project_id: project.id,
        }).catch((e) => console.error('webhook dispatch failed:', e.message));
      } catch (e) {
        console.error(`Project create failed for ${claimedLocale}:`, e.message);
      }
      }

      created.push({ accepted_task_id: acceptedTask.id, target_language: claimedLocale });
    }

    console.log(`globallinkApproveOne: claimed submission ${submissionIdRaw} for ${claimable.join(', ')}`);

    return Response.json({
      success: true,
      submission_ticket: freshTicket,
      claimed_languages: claimable,
      created,
      process_uuid: claimData.process_uuid,
      next_task_name: claimData.next_task_name,
    });
  } catch (error) {
    console.error('globallinkApproveOne error:', error.message);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});