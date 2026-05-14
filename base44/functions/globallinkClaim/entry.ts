// Pure API wrapper around the GlobalLink claim chain.
// Three sequential POSTs to task.pd, each chaining the previous processUuid.
// No DB writes — caller (globallinkApproveOne) handles persistence.
//
// All PD calls go through broker /proxy/pd.
//
// Contract:
//   Input  : { submission_ticket: string, target_languages: string[] }
//   Output : { success: true, claimed_languages, process_uuid } on commit
//          | { success: false, error, reasons?, tp_response? } on TP-side fail
//
// Critical rules (do not relax):
//   1. target_languages MUST be a non-empty array of locale strings.
//   2. parentTickets MUST contain the FRESH ticket from a just-fetched
//      submissionTargetSearch.pd — cached/stale tickets silently no-op.
//   3. 3 sequential POSTs are required. The 3rd is the COMMIT.
//   4. processUuid lives at d.taskResponse.model.processUuid (nested).

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

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
  const pdBody = payload?.body ?? payload;
  if (pdStatus >= 400) {
    const detail = typeof pdBody === 'string' ? pdBody.slice(0, 200) : JSON.stringify(pdBody).slice(0, 200);
    throw new Error(`PD ${endpoint} HTTP ${pdStatus}: ${detail}`);
  }
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

    const brokerUrl = (Deno.env.get('BROKER_URL') || '').replace(/\/$/, '');
    const brokerKey = Deno.env.get('BROKER_KEY');
    if (!brokerUrl || !brokerKey) {
      return Response.json({ success: false, error: 'BROKER_URL or BROKER_KEY secret missing' }, { status: 503 });
    }

    let processUuid = null;
    let finalResponse = null;

    for (let i = 0; i < 3; i++) {
      const jsonTaskData = i === 0
        ? { folder: 'AVAILABLE_SUBMISSION', targetLanguages: target_languages }
        : { processUuid, folder: 'AVAILABLE_SUBMISSION', targetLanguages: target_languages };

      const resp = await pdProxy(brokerUrl, brokerKey, 'task.pd', {
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