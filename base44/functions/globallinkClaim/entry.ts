// Pure API wrapper around the GlobalLink claim chain.
// 6 sequential PD calls (verified against broker logs for claim 0122458).
// No DB writes — caller (globallinkApproveOne) handles persistence.
//
// FULL API REFERENCE: docs/globallink-api.md  (§7.1 — claim chain recipe)
// Keep this implementation in sync with that document.
//
// All PD calls go through broker /proxy/pd.
//
// Contract:
//   Input  : { submission_ticket: string, target_languages: string[] }
//   Output : { success: true, claimed_languages, next_task_name, steps } on commit
//          | { success: false, error, step?, tp_response? } on TP-side fail
//
// Chain (in order — DO NOT reorder):
//   1. submissionLanguageSearch.pd      — enumerate languages for submission
//   2. taskPost.pd       (init)         — claim.PostEdit, parentTickets=[submissionTicket]
//   3. taskPost.pd       (continue)     — same with processUuid threaded
//   4. submissionAvailableItemsLookup.pd — pulls available items for the claim
//   5. task.pd           (init)         — final task commit init
//   6. task.pd           (commit)       — final commit; success iff
//                                          taskResponse.model.nextTaskName === "process linguistic.PostEdit"
//
// Critical rules:
//   - jsonTaskData is ALWAYS a STRING (JSON.stringify) wrapper.
//   - parentTickets is [<submissionTicket>] — NOT jobTickets.
//   - processUuid is extracted from step 2's taskResponse.model and threaded
//     through steps 3, 5, 6.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const FOLDER = 'AVAILABLE_SUBMISSION';
const TASK_NAME = 'claim.PostEdit';
const SUCCESS_NEXT = 'process linguistic.PostEdit';

async function pdProxy(brokerUrl, brokerKey, endpoint, body) {
  const res = await fetch(`${brokerUrl}/proxy/pd`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Broker-Key': brokerKey },
    body: JSON.stringify({ endpoint, body }),
  });
  const text = await res.text();
  let payload;
  try { payload = JSON.parse(text); } catch { payload = { error: text.slice(0, 200) }; }
  if (!res.ok) throw new Error(`Broker HTTP ${res.status}: ${payload?.error || text.slice(0, 200)}`);
  const pdStatus = payload?.status ?? 200;
  const pdBody = payload?.bodyJson ?? payload?.body ?? payload;
  if (pdStatus >= 400) {
    const detail = typeof pdBody === 'string' ? pdBody.slice(0, 200) : JSON.stringify(pdBody).slice(0, 200);
    throw new Error(`PD ${endpoint} HTTP ${pdStatus}: ${detail}`);
  }
  return pdBody;
}

// PD's two endpoints return processUuid in DIFFERENT envelopes:
//   - taskPost.pd → resp.taskInfos[0].model.processUuid  (dialog state init)
//   - task.pd     → resp.taskResponse.model.processUuid  (real commit init)
// We probe both shapes so callers don't need to know which one they're on.
function extractProcessUuid(resp) {
  return resp?.taskInfos?.[0]?.model?.processUuid
      || resp?.taskResponse?.model?.processUuid
      || resp?.model?.processUuid
      || resp?.processUuid
      || null;
}

// Run the 6-step claim chain. Exported so globallinkApproveOne can reuse it
// without going through a function-to-function invoke (which is blocked).
export async function runClaimChain({ brokerUrl, brokerKey, submissionTicket, targetLanguages }) {
  const steps = [];
  let processUuid = null;

  // Step 1: submissionLanguageSearch.pd
  const s1 = await pdProxy(brokerUrl, brokerKey, 'submissionLanguageSearch.pd', {
    submissionTicket, folder: FOLDER,
  });
  steps.push({ step: 1, endpoint: 'submissionLanguageSearch.pd', success: s1?.success !== false });
  if (s1?.success === false) {
    return { success: false, step: 1, error: 'submissionLanguageSearch failed', tp_response: s1, steps };
  }

  // Step 2: taskPost.pd (dialog init) — per §6.6/§7.1, processUuid lives at
  // taskInfos[0].model and the body is minimal ({folder} only — no targetLanguages).
  const s2 = await pdProxy(brokerUrl, brokerKey, 'taskPost.pd', {
    taskName: TASK_NAME,
    parentTickets: [submissionTicket],
    jsonTaskData: JSON.stringify({ folder: FOLDER }),
  });
  processUuid = extractProcessUuid(s2);
  steps.push({ step: 2, endpoint: 'taskPost.pd (init)', processUuid, success: s2?.success !== false });
  if (!processUuid) {
    return { success: false, step: 2, error: 'taskPost.pd init: no processUuid', tp_response: s2, steps };
  }
  if (s2?.success === false) {
    return { success: false, step: 2, error: 'taskPost.pd init failed', tp_response: s2, steps };
  }

  // Step 3: taskPost.pd (dialog continue) — body is {processUuid, folder} only.
  const s3 = await pdProxy(brokerUrl, brokerKey, 'taskPost.pd', {
    taskName: TASK_NAME,
    parentTickets: [submissionTicket],
    jsonTaskData: JSON.stringify({ processUuid, folder: FOLDER }),
  });
  steps.push({ step: 3, endpoint: 'taskPost.pd (continue)', success: s3?.success !== false });
  if (s3?.success === false) {
    return { success: false, step: 3, error: 'taskPost.pd continue failed', tp_response: s3, steps };
  }

  // Step 4: submissionAvailableItemsLookup.pd — per §6.4 body needs
  // taskName + phaseName (NOT processUuid / targetLanguages).
  const s4 = await pdProxy(brokerUrl, brokerKey, 'submissionAvailableItemsLookup.pd', {
    folder: FOLDER,
    submissionTicket,
    taskName: TASK_NAME,
    phaseName: 'PostEdit',
    index: 0,
    size: 50,
  });
  steps.push({ step: 4, endpoint: 'submissionAvailableItemsLookup.pd', success: s4?.success !== false });
  if (s4?.success === false) {
    return { success: false, step: 4, error: 'submissionAvailableItemsLookup failed', tp_response: s4, steps };
  }

  // Step 5: task.pd (init)
  const s5 = await pdProxy(brokerUrl, brokerKey, 'task.pd', {
    taskName: TASK_NAME,
    parentTickets: [submissionTicket],
    jsonTaskData: JSON.stringify({ processUuid, folder: FOLDER, targetLanguages }),
  });
  steps.push({ step: 5, endpoint: 'task.pd (init)', success: s5?.success !== false });
  if (s5?.success === false) {
    return { success: false, step: 5, error: 'task.pd init failed', tp_response: s5, steps };
  }

  // Step 6: task.pd (commit) — final
  const s6 = await pdProxy(brokerUrl, brokerKey, 'task.pd', {
    taskName: TASK_NAME,
    parentTickets: [submissionTicket],
    jsonTaskData: JSON.stringify({ processUuid, folder: FOLDER, targetLanguages }),
  });
  const nextTaskName = s6?.taskResponse?.model?.nextTaskName
                    || s6?.model?.nextTaskName
                    || null;
  const committed = nextTaskName === SUCCESS_NEXT;
  steps.push({ step: 6, endpoint: 'task.pd (commit)', nextTaskName, committed });

  if (!committed) {
    return {
      success: false,
      step: 6,
      error: `task.pd commit did not return nextTaskName="${SUCCESS_NEXT}" (got "${nextTaskName}")`,
      tp_response: s6,
      steps,
    };
  }

  return {
    success: true,
    submission_ticket: submissionTicket,
    claimed_languages: targetLanguages,
    process_uuid: processUuid,
    next_task_name: nextTaskName,
    steps,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (user !== null && user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { submission_ticket, target_languages } = body || {};

    if (!submission_ticket) {
      return Response.json({ success: false, error: 'submission_ticket is required' }, { status: 400 });
    }
    if (!Array.isArray(target_languages) || target_languages.length === 0) {
      return Response.json(
        { success: false, error: 'target_languages must be a non-empty array of locale strings (e.g. ["tr-TR"])' },
        { status: 400 }
      );
    }

    const brokerUrl = (Deno.env.get('BROKER_URL') || '').replace(/\/$/, '');
    const brokerKey = Deno.env.get('BROKER_KEY');
    if (!brokerUrl || !brokerKey) {
      return Response.json({ success: false, error: 'BROKER_URL or BROKER_KEY secret missing' }, { status: 503 });
    }

    const result = await runClaimChain({
      brokerUrl, brokerKey,
      submissionTicket: submission_ticket,
      targetLanguages: target_languages,
    });

    return Response.json(result, { status: result.success ? 200 : 502 });
  } catch (error) {
    console.error('globallinkClaim error:', error.message);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});