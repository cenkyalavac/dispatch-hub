// Rule-based auto-claim for GlobalLink — mirrors symfonieProcessTasks /
// junctionProcessOffers patterns so all three portals behave identically.
//
// Flow per run:
//   1. Kill-switch: skip when Portal(key='globallink').is_active=false.
//   2. Pull `available` GlobalLinkSubmission rows.
//   3. Pull active Rules where portal in ('globallink','*'), sorted by priority asc.
//   4. For each submission, find the FIRST matching rule.
//        - rule.action='accept' → run inline 6-step claim chain (broker /proxy/pd),
//          on success: create AcceptedTask + Project, fire dispatchWebhook, flip
//          submission to 'claimed'.
//        - rule.action='reject' → flip submission to 'skipped' (PD has no
//          reject endpoint for submissions; we just hide it locally).
//        - no rule match → emit notifyNewTask (human-decision path).
//
// Inline claim chain duplicates functions/globallinkClaim::runClaimChain because
// cross-function imports are blocked in this runtime. Keep both in sync.
//
// FULL API REFERENCE: docs/globallink-api.md §7.1 (claim chain), §6.* (PD endpoints)

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const FOLDER = 'AVAILABLE_SUBMISSION';
const TASK_NAME = 'claim.PostEdit';
const SUCCESS_NEXT = 'process linguistic.PostEdit';

// ──────────────────────────────────────────────────────────────────────────
// Locale-family intersection (copied from globallinkApproveOne — same rules).
// ──────────────────────────────────────────────────────────────────────────
function localeMatchesFamily(locale, family) {
  if (!locale || !family) return false;
  const loc = String(locale).toLowerCase();
  const fam = String(family).toLowerCase();
  return loc === fam || loc.startsWith(fam + '-') || loc.startsWith(fam + '_');
}

// ──────────────────────────────────────────────────────────────────────────
// Rule evaluator — same operator semantics as symfonieProcessTasks so a
// condition behaves identically across all three portals.
// ──────────────────────────────────────────────────────────────────────────
function evalCond(submission, condition) {
  const { field, operator, value } = condition;
  // Map Rule.field → GlobalLinkSubmission column. Symfonie-only fields (task_name,
  // workflow_name, project_manager_*) gracefully fall back so a misconfigured
  // shared rule doesn't crash the run — it just won't match.
  const valueByField = {
    project_name: submission.project_name,
    task_name: submission.submission_name,
    workflow_name: submission.workflow_name,
    source_language: submission.source_language,
    target_language: submission.target_language,
    client_name: submission.client_name,
    submission_id: submission.submission_id,
    submission_ticket: submission.submission_ticket,
    account_id: submission.account_id,
    phase_name: submission.phase_name,
    word_count: submission.word_count,
    quantity: submission.word_count,
    weighted_wc: submission.weighted_wc,
    lev_context: submission.lev_context,
    lev_rep: submission.lev_rep,
    lev_match100: submission.lev_match100,
    lev_9599: submission.lev_9599,
    lev_8594: submission.lev_8594,
    lev_7584: submission.lev_7584,
    lev_5074: submission.lev_5074,
    lev_no_match: submission.lev_no_match,
    deadline_at: submission.deadline_at,
    due_date: submission.due_date,
  };
  const raw = valueByField[field];
  const isNumField = [
    'word_count', 'quantity', 'price', 'weighted_wc',
    'lev_context', 'lev_rep', 'lev_match100',
    'lev_9599', 'lev_8594', 'lev_7584', 'lev_5074', 'lev_no_match',
  ].includes(field);

  if (isNumField) {
    const n = Number(raw) || 0;
    const nt = Number(value);
    switch (operator) {
      case 'greater_than': return n > nt;
      case 'less_than': return n < nt;
      case 'greater_equal': return n >= nt;
      case 'less_equal': return n <= nt;
      case 'equals': return n === nt;
      default: return false;
    }
  }

  const s = String(raw ?? '').toLowerCase();
  const t = String(value ?? '').toLowerCase();
  switch (operator) {
    case 'contains': return s.includes(t);
    case 'not_contains': return !s.includes(t);
    case 'equals': return s === t;
    case 'starts_with': return s.startsWith(t);
    default: return false;
  }
}

function matchesRule(rule, submission) {
  if (!rule.conditions || rule.conditions.length === 0) return true;
  return rule.conditions.every((c) => evalCond(submission, c));
}

// ──────────────────────────────────────────────────────────────────────────
// PD broker proxy (same envelope handling as globallinkPoll / globallinkApproveOne).
// ──────────────────────────────────────────────────────────────────────────
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
  const pdBody = payload?.bodyJson ?? payload?.body ?? payload;
  if (pdStatus >= 400) throw new Error(`PD ${endpoint} HTTP ${pdStatus}: ${pdBody?.description || pdBody?.reasons || JSON.stringify(pdBody).slice(0, 200)}`);
  return pdBody;
}

// ──────────────────────────────────────────────────────────────────────────
// Inline 6-step claim chain — duplicated from functions/globallinkClaim because
// cross-function service invokes are blocked. KEEP IN SYNC.
// ──────────────────────────────────────────────────────────────────────────
async function runClaimChain({ brokerUrl, brokerKey, submissionTicket, targetLanguages }) {
  // 1. submissionLanguageSearch.pd
  await pdProxy(brokerUrl, brokerKey, 'submissionLanguageSearch.pd', {
    submissionTicket, folder: FOLDER,
  });

  // 2. taskPost.pd (init) — processUuid lives at taskInfos[0].model
  const s2 = await pdProxy(brokerUrl, brokerKey, 'taskPost.pd', {
    taskName: TASK_NAME,
    parentTickets: [submissionTicket],
    jsonTaskData: JSON.stringify({ folder: FOLDER }),
  });
  const processUuid = s2?.taskInfos?.[0]?.model?.processUuid
    || s2?.taskResponse?.model?.processUuid
    || s2?.model?.processUuid
    || s2?.processUuid
    || null;
  if (!processUuid) {
    return { success: false, step: 2, error: 'taskPost.pd init: no processUuid' };
  }
  if (s2?.success === false) {
    return { success: false, step: 2, error: `taskPost.pd init failed: ${s2.description || JSON.stringify(s2).slice(0, 200)}` };
  }

  // 3. taskPost.pd (continue)
  const s3 = await pdProxy(brokerUrl, brokerKey, 'taskPost.pd', {
    taskName: TASK_NAME,
    parentTickets: [submissionTicket],
    jsonTaskData: JSON.stringify({ processUuid, folder: FOLDER }),
  });
  if (s3?.success === false) {
    return { success: false, step: 3, error: `taskPost.pd continue failed: ${s3.description || JSON.stringify(s3).slice(0, 200)}` };
  }

  // 4. submissionAvailableItemsLookup.pd
  const s4 = await pdProxy(brokerUrl, brokerKey, 'submissionAvailableItemsLookup.pd', {
    folder: FOLDER,
    submissionTicket,
    taskName: TASK_NAME,
    phaseName: 'PostEdit',
    index: 0,
    size: 50,
  });
  if (s4?.success === false) {
    return { success: false, step: 4, error: `submissionAvailableItemsLookup failed: ${s4.description || JSON.stringify(s4).slice(0, 200)}` };
  }

  // 5. task.pd (REAL init) — returns processUuid_B
  const s5 = await pdProxy(brokerUrl, brokerKey, 'task.pd', {
    taskName: TASK_NAME,
    parentTickets: [submissionTicket],
    jsonTaskData: JSON.stringify({ folder: FOLDER, targetLanguages }),
  });
  if (s5?.success === false) {
    return { success: false, step: 5, error: `task.pd init failed: ${s5.description || JSON.stringify(s5).slice(0, 200)}` };
  }
  const processUuidB = s5?.taskResponse?.model?.processUuid
    || s5?.model?.processUuid
    || s5?.taskInfos?.[0]?.model?.processUuid
    || processUuid;

  // 6. task.pd (REAL commit)
  const s6 = await pdProxy(brokerUrl, brokerKey, 'task.pd', {
    taskName: TASK_NAME,
    parentTickets: [submissionTicket],
    jsonTaskData: JSON.stringify({ processUuid: processUuidB, folder: FOLDER, targetLanguages }),
  });
  const nextTaskName = s6?.taskResponse?.model?.nextTaskName || s6?.model?.nextTaskName || null;
  if (nextTaskName !== SUCCESS_NEXT) {
    return { success: false, step: 6, error: `task.pd commit returned nextTaskName="${nextTaskName}" (expected "${SUCCESS_NEXT}")` };
  }

  return { success: true, process_uuid: processUuid, next_task_name: nextTaskName };
}

// ──────────────────────────────────────────────────────────────────────────
// Handler
// ──────────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Soft auth — scheduled runs have no user context.
    const user = await base44.auth.me().catch(() => null);
    if (user !== null && user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Kill switch
    const portalRows = await base44.asServiceRole.entities.Portal.filter({ key: 'globallink' });
    const portal = portalRows[0] || null;
    if (portal && portal.is_active === false) {
      console.log('globallinkProcessSubmissions skipped: portal is_active=false');
      return Response.json({ success: true, skipped: true, reason: 'Portal disabled', summary: { accepted: 0, rejected: 0, notified: 0, errors: 0 } });
    }

    const brokerUrl = (Deno.env.get('BROKER_URL') || '').replace(/\/$/, '');
    const brokerKey = Deno.env.get('BROKER_KEY');
    if (!brokerUrl || !brokerKey) {
      return Response.json({ success: false, error: 'BROKER_URL or BROKER_KEY secret missing' }, { status: 503 });
    }

    // 1. Available submissions in our DB.
    const submissions = await base44.asServiceRole.entities.GlobalLinkSubmission.filter(
      { status: 'available' }, '-created_date', 200
    );
    if (submissions.length === 0) {
      return Response.json({ success: true, summary: { accepted: 0, rejected: 0, notified: 0, errors: 0 }, total: 0 });
    }

    // 2. Active rules for globallink (and any-portal wildcards).
    const allRules = await base44.asServiceRole.entities.Rule.filter({ is_active: true }, 'priority', 500);
    const rules = allRules.filter((r) => r.portal === 'globallink' || r.portal === '*');
    console.log(`globallinkProcessSubmissions: ${submissions.length} available, ${rules.length} active globallink/* rules`);

    const families = portal?.allowed_language_families || [];
    const results = { accepted: [], rejected: [], notified: [], errors: [] };

    // Cache by submission_ticket — same submission for two locales would otherwise
    // run the claim chain twice. Each ticket can be claimed once; subsequent
    // language rows piggy-back the prior claim.
    const claimedTickets = new Map(); // ticket → { ok: bool, langs: string[], error?: string }

    for (const sub of submissions) {
      // Locale family gate — if the portal has an allow-list, ensure this
      // target_language is in it before we even look at rules. (Same gate
      // globallinkApproveOne applies.)
      if (families.length > 0 && !families.some((f) => localeMatchesFamily(sub.target_language, f))) {
        continue;
      }

      // Find first matching rule (rules already sorted by priority asc).
      let matchedRule = null;
      for (const r of rules) {
        if (matchesRule(r, sub)) { matchedRule = r; break; }
      }

      if (!matchedRule) {
        // Notify path — fire-and-forget. Mirrors symfonieProcessTasks.
        // Use regular functions.invoke — asServiceRole.functions.invoke
        // is rejected by the platform's invoke layer with a 403 before
        // reaching the target function (verified during handleDueDateChange
        // debug session). Regular invoke from a scheduled context passes
        // through and notifyNewTask's auth gate accepts the service caller.
        const task_id = `${sub.submission_ticket}:${sub.target_language}`;
        base44.functions.invoke('notifyNewTask', {
          portal: 'globallink',
          task_id,
          task_payload: {
            task_name: sub.submission_name || sub.submission_id || sub.submission_ticket,
            project_name: sub.project_name || '',
            client_name: sub.client_name || '',
            source_language: sub.source_language || '',
            target_language: sub.target_language || '',
            word_count: sub.word_count || 0,
            weighted_wc: sub.weighted_wc || 0,
            price: 0,
            due_date: sub.deadline_at || sub.due_date || null,
            workflow_name: sub.workflow_name || '',
            phase_name: sub.phase_name || '',
            submission_ticket: sub.submission_ticket,
            lev_context: sub.lev_context, lev_rep: sub.lev_rep, lev_match100: sub.lev_match100,
            lev_9599: sub.lev_9599, lev_8594: sub.lev_8594, lev_7584: sub.lev_7584,
            lev_5074: sub.lev_5074, lev_no_match: sub.lev_no_match,
          },
        }).catch((e) => console.error('notifyNewTask failed:', e.message));
        results.notified.push({ submission_id: sub.submission_id, target_language: sub.target_language });
        continue;
      }

      // Rule matched — apply action.
      if (matchedRule.action === 'reject') {
        await base44.asServiceRole.entities.GlobalLinkSubmission.update(sub.id, {
          status: 'skipped',
          claim_error: `Rule reject: ${matchedRule.name}`,
        }).catch((e) => console.error('reject update failed:', e.message));
        results.rejected.push({ submission_id: sub.submission_id, target_language: sub.target_language, rule: matchedRule.name });
        continue;
      }

      // Accept — run claim chain (once per ticket, even if rule matched on
      // multiple language rows for the same submission).
      let claim = claimedTickets.get(sub.submission_ticket);
      if (!claim) {
        try {
          const r = await runClaimChain({
            brokerUrl, brokerKey,
            submissionTicket: sub.submission_ticket,
            targetLanguages: [sub.target_language],
          });
          claim = r.success
            ? { ok: true, langs: [sub.target_language], process_uuid: r.process_uuid, next_task_name: r.next_task_name }
            : { ok: false, error: r.error || 'claim chain failed' };
          claimedTickets.set(sub.submission_ticket, claim);
        } catch (e) {
          claim = { ok: false, error: e.message };
          claimedTickets.set(sub.submission_ticket, claim);
        }
      }

      if (!claim.ok) {
        await base44.asServiceRole.entities.GlobalLinkSubmission.update(sub.id, {
          status: 'error',
          claim_error: claim.error,
        }).catch((e) => console.error('error update failed:', e.message));
        results.errors.push({ submission_id: sub.submission_id, target_language: sub.target_language, rule: matchedRule.name, error: claim.error });
        continue;
      }

      // Claim succeeded — create AcceptedTask + Project, flip submission to claimed.
      const acceptedAt = new Date().toISOString();
      try {
        const acceptedTask = await base44.asServiceRole.entities.AcceptedTask.create({
          portal: 'globallink',
          task_id: Number(sub.submission_id) || sub.submission_ticket,
          task_name: sub.submission_name || `Submission ${sub.submission_id || sub.submission_ticket}`,
          project_name: sub.project_name || sub.submission_name || '',
          client_name: sub.client_name || '',
          account_id: sub.account_id || '',
          source_language: sub.source_language || '',
          target_language: sub.target_language,
          word_count: sub.word_count || 0,
          price: 0,
          due_date: sub.due_date || null,
          accepted_at: acceptedAt,
          matched_rule: matchedRule.name,
          status: 'accepted',
          sheets_synced: false,
          submission_id: sub.submission_id || '',
          submission_ticket: sub.submission_ticket || '',
          weighted_wc: sub.weighted_wc ?? 0,
          lev_context:  sub.lev_context  ?? 0,
          lev_rep:      sub.lev_rep      ?? 0,
          lev_match100: sub.lev_match100 ?? 0,
          lev_9599:     sub.lev_9599     ?? 0,
          lev_8594:     sub.lev_8594     ?? 0,
          lev_7584:     sub.lev_7584     ?? 0,
          lev_5074:     sub.lev_5074     ?? 0,
          lev_rep_9599: sub.lev_rep_9599 ?? 0,
          lev_rep_8594: sub.lev_rep_8594 ?? 0,
          lev_rep_7584: sub.lev_rep_7584 ?? 0,
          lev_rep_5074: sub.lev_rep_5074 ?? 0,
          lev_no_match: sub.lev_no_match ?? 0,
          deadline_at:  sub.deadline_at  || null,
          phase_name:   sub.phase_name   || '',
          workflow_name: sub.workflow_name || '',
        });

        await base44.asServiceRole.entities.GlobalLinkSubmission.update(sub.id, {
          status: 'claimed',
          claimed_at: acceptedAt,
          accepted_task_id: acceptedTask.id,
          claim_error: null,
        }).catch((e) => console.error('claim update failed:', e.message));

        // Project + webhook (BMS pipeline parity with Symfonie/Junction).
        try {
          const project = await base44.asServiceRole.entities.Project.create({
            tenant_id: 'default',
            accepted_task_id: acceptedTask.id,
            portal: 'globallink',
            external_id: `globallink:${sub.submission_ticket}:${sub.target_language}`,
            state: 'accepted',
            name: sub.submission_name || '',
            client_name: sub.client_name || '',
            project_name: sub.submission_name || '',
            source_language: sub.source_language || '',
            target_language: sub.target_language,
            word_count: sub.word_count || 0,
            price: 0,
            currency: 'USD',
            due_date: sub.due_date || null,
            accepted_at: acceptedAt,
            origin: { submission_ticket: sub.submission_ticket, submission_id: sub.submission_id, matched_rule: matchedRule.name },
          });
          base44.functions.invoke('dispatchWebhook', {
            tenant_id: 'default', event: 'project.accepted', project_id: project.id,
          }).catch((e) => console.error('webhook dispatch failed:', e.message));
        } catch (e) {
          console.error(`Project create failed for ${sub.submission_id}/${sub.target_language}:`, e.message);
        }

        results.accepted.push({
          submission_id: sub.submission_id,
          target_language: sub.target_language,
          rule: matchedRule.name,
          accepted_task_id: acceptedTask.id,
        });
      } catch (e) {
        console.error(`AcceptedTask create failed for ${sub.submission_id}:`, e.message);
        results.errors.push({ submission_id: sub.submission_id, target_language: sub.target_language, error: e.message });
      }
    }

    // Fire one batch sheet sync if anything was accepted (sheetsSyncPending
    // picks up sheets_synced=false rows). Matches Symfonie/Junction flow.
    if (results.accepted.length > 0) {
      base44.functions.invoke('sheetsSyncPending', {})
        .catch((e) => console.error('sheetsSyncPending trigger failed:', e.message));
    }

    if (portal?.id) {
      await base44.asServiceRole.entities.Portal.update(portal.id, {
        last_sync_at: new Date().toISOString(),
      }).catch(() => null);
    }

    console.log(`globallinkProcessSubmissions done: ${results.accepted.length} accepted, ${results.rejected.length} rejected, ${results.notified.length} notified, ${results.errors.length} errors`);

    return Response.json({
      success: true,
      summary: {
        total: submissions.length,
        accepted: results.accepted.length,
        rejected: results.rejected.length,
        notified: results.notified.length,
        errors: results.errors.length,
      },
      details: results,
    });
  } catch (error) {
    console.error('globallinkProcessSubmissions error:', error.message);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});