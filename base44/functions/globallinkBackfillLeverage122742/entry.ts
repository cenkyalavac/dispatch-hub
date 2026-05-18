// ONE-OFF recovery helper for submission 122742.
//
// Why this exists: 122742 was claimed directly in the PD portal (never hit
// AVAILABLE_SUBMISSION), so globallinkPoll never called submissionView.pd
// for it and the 12-band leverage + WWC were never captured. The manual
// AcceptedTask row written in the previous recovery step has all leverage
// fields = null.
//
// What it does:
//   1. Calls submissionView.pd via broker for ticket=122742 / locale=tr-tr.
//      (Same call globallinkPoll makes per locale.)
//   2. Normalizes the 12 bands the same way lib/leverage.js / globallinkPoll do.
//   3. Computes WWC with the MTPE-aligned formula.
//   4. Updates the AcceptedTask row and re-triggers sheetsSyncPending so the
//      Hub2 sheet row picks up the new band columns + WWC.
//
// Submission_ticket is unknown (the manual insert didn't carry it because
// 122742 never appeared in our DB), so the function looks it up by calling
// PD's CLAIMED/IN_PROGRESS folder via submissionTargetSearch.pd, matching by
// submissionId=122742. Falls back to user-supplied ticket if provided.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

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
  const out = { context: 0, rep: 0, match100: 0, f9599: 0, f8594: 0, f7584: 0, f5074: 0, rep_9599: 0, rep_8594: 0, rep_7584: 0, rep_5074: 0, no_match: 0 };
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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (user !== null && user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { submission_ticket: tktOverride, folder_override } = await req.json().catch(() => ({}));

    const brokerUrl = (Deno.env.get('BROKER_URL') || '').replace(/\/$/, '');
    const brokerKey = Deno.env.get('BROKER_KEY');
    if (!brokerUrl || !brokerKey) {
      return Response.json({ success: false, error: 'BROKER_URL or BROKER_KEY secret missing' }, { status: 503 });
    }

    // Find the AcceptedTask we wrote in the previous recovery step.
    const rows = await base44.asServiceRole.entities.AcceptedTask.filter({
      portal: 'globallink', submission_id: '122742',
    });
    const at = rows[0];
    if (!at) return Response.json({ success: false, error: 'AcceptedTask for submission 122742 not found' }, { status: 404 });

    const targetLocale = at.target_language || 'tr-TR';

    // Resolve submission_ticket. If caller passed one, use it. Otherwise try
    // PD's IN_PROGRESS folder (the submission has already been claimed).
    let ticket = tktOverride || at.submission_ticket || null;
    const folderHints = folder_override ? [folder_override] : ['IN_PROGRESS_SUBMISSION', 'CLAIMED_SUBMISSION', 'MY_SUBMISSIONS', 'AVAILABLE_SUBMISSION'];
    const folderTried = [];
    if (!ticket) {
      for (const folder of folderHints) {
        try {
          const listData = await pdProxy(brokerUrl, brokerKey, 'submissionTargetSearch.pd', {
            folder, entityTickets: [], parentEntityTickets: [], index: 0, size: 200,
          });
          folderTried.push({ folder, count: (listData?.items || []).length });
          const match = (listData?.items || []).find((s) => String(s.submissionId) === '122742');
          if (match?.ticket) { ticket = match.ticket; break; }
        } catch (e) {
          folderTried.push({ folder, error: e.message });
        }
      }
    }
    if (!ticket) {
      return Response.json({
        success: false,
        error: 'Could not resolve submission_ticket for 122742 from any PD folder. Pass {submission_ticket: "..."} explicitly.',
        folders_tried: folderTried,
      }, { status: 404 });
    }

    // Try submissionView.pd across the same folder list — leverage data is
    // folder-scoped on PD's side.
    const viewFolders = folder_override ? [folder_override] : ['IN_PROGRESS_SUBMISSION', 'CLAIMED_SUBMISSION', 'MY_SUBMISSIONS', 'AVAILABLE_SUBMISSION'];
    let view = null;
    let viewFolderUsed = null;
    const viewErrors = [];
    for (const folder of viewFolders) {
      try {
        view = await pdProxy(brokerUrl, brokerKey, 'submissionView.pd', {
          classifier: 'Batch1',
          folder,
          submissionTicket: ticket,
          sourceLanguageComboBox: targetLocale.toLowerCase(),
          index: 0, size: 50,
        });
        viewFolderUsed = folder;
        break;
      } catch (e) {
        viewErrors.push({ folder, error: e.message });
      }
    }
    if (!view) {
      return Response.json({
        success: false,
        error: 'submissionView.pd failed across all folders',
        attempts: viewErrors,
      }, { status: 502 });
    }

    const addl = view?.additionalData || view?.aditionalData || {};
    const lev = normalizeLeverage(addl.cumulativeTmStatistics);
    const wwc = computeWwc(lev);

    const update = {
      lev_context:  lev.context,
      lev_rep:      lev.rep,
      lev_match100: lev.match100,
      lev_9599:     lev.f9599,
      lev_8594:     lev.f8594,
      lev_7584:     lev.f7584,
      lev_5074:     lev.f5074,
      lev_rep_9599: lev.rep_9599,
      lev_rep_8594: lev.rep_8594,
      lev_rep_7584: lev.rep_7584,
      lev_rep_5074: lev.rep_5074,
      lev_no_match: lev.no_match,
      weighted_wc:  wwc,
      submission_ticket: ticket,
      sheets_synced: false,  // force the sheet sync to re-write this row
    };

    await base44.asServiceRole.entities.AcceptedTask.update(at.id, update);

    // Re-trigger sheet sync so Hub2 row picks up the new columns.
    let syncResult = null;
    try {
      const r = await base44.functions.invoke('sheetsSyncPending', {});
      syncResult = r?.data || r;
    } catch (e) {
      syncResult = { error: e.message };
    }

    return Response.json({
      success: true,
      submission_ticket: ticket,
      view_folder_used: viewFolderUsed,
      raw_bands: addl.cumulativeTmStatistics || null,
      normalized: lev,
      weighted_wc: wwc,
      sheet_sync: syncResult,
    });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});