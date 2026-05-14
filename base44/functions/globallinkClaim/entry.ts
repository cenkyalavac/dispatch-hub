// Pure API wrapper around the GlobalLink claim chain.
// Three sequential POSTs to task.pd, each chaining the previous processUuid.
// No DB writes — caller (globallinkApproveOne) handles persistence.

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
    const { submission_ticket, target_language = 'tr-TR' } = body || {};
    if (!submission_ticket) {
      return Response.json({ success: false, error: 'submission_ticket is required' }, { status: 400 });
    }

    const tokenRes = await base44.asServiceRole.functions.invoke('getGlobalLinkToken', {});
    if (!tokenRes?.data?.token_value) {
      return Response.json({ success: false, error: tokenRes?.data?.error || 'No cached GlobalLink JWT available' }, { status: 503 });
    }
    const jwt = tokenRes.data.token_value;
    const contextUser = Deno.env.get('GLOBALLINK_CONTEXT_USER') || 'VerbatoTrans';
    const base = (Deno.env.get('GLOBALLINK_BASE_URL') || DEFAULT_BASE).replace(/\/$/, '');

    const headers = {
      'Authorization': `Bearer ${jwt}`,
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      'ajaxRequest': 'true',
      'appVersion': '11.5.0',
      'contextUser': contextUser,
    };

    const jsonTaskData = JSON.stringify({
      folder: 'AVAILABLE_SUBMISSION',
      targetLanguages: [target_language],
    });

    // 1st POST — initiate
    const r1 = await postTask(base, headers, {
      taskName: 'claim.PostEdit',
      parentTickets: [submission_ticket],
      jsonTaskData,
    });
    const uuid1 = r1?.processUuid || r1?.uuid;
    if (!uuid1) throw new Error('claim step 1: missing processUuid in response');

    // 2nd POST — chain uuid
    const r2 = await postTask(base, headers, {
      taskName: 'claim.PostEdit',
      parentTickets: [submission_ticket],
      jsonTaskData,
      processUuid: uuid1,
    });
    const uuid2 = r2?.processUuid || r2?.uuid || uuid1;

    // 3rd POST — finalize
    const r3 = await postTask(base, headers, {
      taskName: 'claim.PostEdit',
      parentTickets: [submission_ticket],
      jsonTaskData,
      processUuid: uuid2,
    });

    return Response.json({
      success: true,
      submission_ticket,
      target_language,
      process_uuid: uuid2,
      final_response: r3,
    });
  } catch (error) {
    console.error('globallinkClaim error:', error.message);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});