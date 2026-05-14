// Pure API wrapper around the GlobalLink claim chain.
// Three sequential POSTs to task.pd, each chaining the previous processUuid.
// No DB writes — caller (globallinkApproveOne) handles persistence.
//
// Contract:
//   Input  : { submission_ticket: string, target_languages: string[] }
//   Output : { success: true, claimed_languages, process_uuid } on commit
//          | { success: false, error, reasons?, tp_response? } on TP-side fail
//
// Critical rules (do not relax):
//   1. target_languages MUST be a non-empty array of locale strings — empty
//      array = silent no-op on TP side. Caller is responsible for the locale
//      intersection logic (see globallinkApproveOne).
//   2. parentTickets MUST contain the FRESH ticket from a just-fetched
//      submissionTargetSearch.pd — cached/stale tickets silently no-op.
//   3. 3 sequential POSTs are required. 1 or 2 calls may return success:true
//      but do NOT commit the claim. The 3rd is the COMMIT.
//   4. processUuid lives at d.taskResponse.model.processUuid (nested), not at
//      the response root.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const DEFAULT_BASE = 'https://gle-prod-eu.transperfect.com/PD';

async function postTask(base, headers, body) {
  const res = await fetch(`${base}/task.pd`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) {
    const detail = typeof data === 'string' ? data.slice(0, 200) : JSON.stringify(data).slice(0, 200);
    throw new Error(`task.pd HTTP ${res.status}: ${detail}`);
  }
  return data;
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
        { success: false, error: 'target_languages must be a non-empty array of locale strings (e.g. ["tr-TR","ar-SA"])' },
        { status: 400 }
      );
    }

    const tokenRes = await base44.asServiceRole.functions.invoke('getGlobalLinkToken', {});
    if (!tokenRes?.data?.token_value) {
      return Response.json({ success: false, error: tokenRes?.data?.error || 'No cached GlobalLink JWT available' }, { status: 503 });
    }
    const jwt = tokenRes.data.token_value;
    const csrf = tokenRes.data.csrf_value || null;
    const contextUser = Deno.env.get('GLOBALLINK_CONTEXT_USER') || 'VerbatoTrans';
    const base = (Deno.env.get('GLOBALLINK_BASE_URL') || DEFAULT_BASE).replace(/\/$/, '');

    // PD .pd endpoints require BOTH Bearer JWT and `csrfToken` header.
    const headers = {
      'Authorization': `Bearer ${jwt}`,
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      'ajaxRequest': 'true',
      'appVersion': '11.5.0',
      'contextUser': contextUser,
    };
    if (csrf) headers['csrfToken'] = csrf;

    let processUuid = null;
    let finalResponse = null;

    for (let i = 0; i < 3; i++) {
      const jsonTaskData = i === 0
        ? { folder: 'AVAILABLE_SUBMISSION', targetLanguages: target_languages }
        : { processUuid, folder: 'AVAILABLE_SUBMISSION', targetLanguages: target_languages };

      const resp = await postTask(base, headers, {
        taskName: 'claim.PostEdit',
        parentTickets: [submission_ticket],
        jsonTaskData: JSON.stringify(jsonTaskData),
      });

      if (i === 0) {
        processUuid = resp?.taskResponse?.model?.processUuid || resp?.processUuid || resp?.uuid || null;
        if (!processUuid) {
          return Response.json({
            success: false,
            error: 'Claim step 1 failed: no processUuid in taskResponse.model',
            tp_response: resp,
          }, { status: 502 });
        }
      }

      if (resp?.success === false) {
        return Response.json({
          success: false,
          error: `Claim step ${i + 1} failed`,
          reasons: resp.reasons || resp.desciption || resp.description || null,
          tp_response: resp,
        }, { status: 502 });
      }

      finalResponse = resp;
    }

    return Response.json({
      success: true,
      submission_ticket,
      claimed_languages: target_languages,
      process_uuid: processUuid,
      final_response: finalResponse,
    });
  } catch (error) {
    console.error('globallinkClaim error:', error.message);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});