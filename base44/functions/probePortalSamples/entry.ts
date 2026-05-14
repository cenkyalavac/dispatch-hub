// Temporary diagnostic function. Pulls one raw sample from each portal so we can
// inspect what fields actually arrive (vs. what BeLazy docs claim). Safe to
// delete after inspection.
//
// Returns:
//   {
//     globallink: { available_first, submissionView_first, errors },
//     symfonie:   { task_first, errors },
//     junction:   { offer_first, errors }
//   }
//
// Admin only.

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
  if (!res.ok) throw new Error(`Broker HTTP ${res.status}: ${payload?.error || text.slice(0, 200)}`);
  return { status: payload?.status ?? 200, body: payload?.bodyJson ?? payload?.body ?? payload };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const out = { globallink: {}, symfonie: {}, junction: {} };

    // ──────── GlobalLink ────────
    try {
      const brokerUrl = (Deno.env.get('BROKER_URL') || '').replace(/\/$/, '');
      const brokerKey = Deno.env.get('BROKER_KEY');
      if (!brokerUrl || !brokerKey) throw new Error('BROKER_URL/BROKER_KEY missing');

      const list = await pdProxy(brokerUrl, brokerKey, 'submissionTargetSearch.pd', {
        folder: 'AVAILABLE_SUBMISSION', entityTickets: [], parentEntityTickets: [], index: 0, size: 3,
      });
      const items = list.body?.items || [];
      out.globallink.available_count = items.length;
      out.globallink.available_first = items[0] || null;

      if (items[0]?.ticket) {
        // submissionView: detailed view with cumulativeTmStatistics + pricing lines
        const view = await pdProxy(brokerUrl, brokerKey, 'submissionView.pd', {
          classifier: 'Batch1',
          folder: 'AVAILABLE_SUBMISSION',
          submissionTicket: items[0].ticket,
          sourceLanguageComboBox: (items[0].sourceLocale || items[0].sourceLanguage || 'en-us').toLowerCase(),
        });
        out.globallink.submissionView_status = view.status;
        out.globallink.submissionView_first = view.body;

        // submissionLanguageSearch: target locales + phases
        const lang = await pdProxy(brokerUrl, brokerKey, 'submissionLanguageSearch.pd', {
          submissionTicket: items[0].ticket, folder: 'AVAILABLE_SUBMISSION',
        });
        out.globallink.submissionLanguageSearch_first = lang.body?.items?.[0] || lang.body;
      }
    } catch (e) {
      out.globallink.error = e.message;
    }

    // ──────── Symfonie ────────
    try {
      const symRes = await base44.asServiceRole.functions.invoke('symfonieGetTasks', { limit: 1, fresh: true });
      const symData = symRes?.data || {};
      out.symfonie.task_count = (symData.tasks || []).length;
      out.symfonie.task_first = symData.tasks?.[0] || null;
      out.symfonie.task_first_raw = symData.tasks?.[0]?._raw || null;
    } catch (e) {
      out.symfonie.error = e.message;
    }

    // ──────── Junction ────────
    try {
      const jRes = await base44.asServiceRole.functions.invoke('junctionGetOffers', { limit: 1 });
      const jData = jRes?.data || {};
      out.junction.offer_count = (jData.tasks || jData.offers || []).length;
      out.junction.offer_first = (jData.tasks || jData.offers || [])[0] || null;
      out.junction.offer_first_raw = (jData.tasks || jData.offers || [])[0]?._raw || null;
    } catch (e) {
      out.junction.error = e.message;
    }

    // Ultra-compact output: ONLY key names + selected interesting values.
    const reqBody = await req.json().catch(() => ({}));
    const which = reqBody.portal || 'all';

    // `full: true` → return the entire raw `out` object so the caller can
    // download it as a JSON file for offline analysis. No key filtering.
    if (reqBody.full) {
      return Response.json({
        generated_at: new Date().toISOString(),
        portal_filter: which,
        data: which === 'all' ? out : { [which]: out[which] },
      });
    }
    const sv = out.globallink.submissionView_first || {};
    const sls = out.globallink.submissionLanguageSearch_first || {};
    const compact = {};
    if (which === 'all' || which === 'globallink') {
      compact.globallink = {
        sls_top_keys: Object.keys(sls),
        sls_subPhases: (sls.subPhaseStatusDataHolders || []).map(p => ({
          workflow: p.workflow,
          wordCount: p.wordCount,
          quoteStatus: p.quoteStatus,
          phaseStatusData_keys: Object.keys(p.phaseStatusData || {}),
          phaseStatusData: p.phaseStatusData,
        })),
        sls_phaseStatusData_top: sls.phaseStatusData,
        sls_languageDirectionPreview: sls.languageDirectionPreview,
        sls_workflow_top: sls.workflow,
        sls_wordCount: sls.wordCount,
        error: out.globallink.error,
      };
    }
    if (which === 'all' || which === 'symfonie') {
      compact.symfonie = {
        task_top_keys: Object.keys(out.symfonie.task_first || {}),
        task_raw_keys: Object.keys(out.symfonie.task_first_raw || {}),
        task_first: out.symfonie.task_first,
        error: out.symfonie.error,
      };
    }
    if (which === 'all' || which === 'junction') {
      compact.junction = {
        offer_top_keys: Object.keys(out.junction.offer_first || {}),
        offer_raw_keys: Object.keys(out.junction.offer_first_raw || {}),
        offer_first: out.junction.offer_first,
        error: out.junction.error,
      };
    }
    return Response.json(compact);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
});