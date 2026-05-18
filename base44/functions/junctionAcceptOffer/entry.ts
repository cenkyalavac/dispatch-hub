import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const PROD_BASE = 'https://hypnos.welocalize.tools';

// Sheet write is delegated to `sheetsSyncPending` (fire-and-forget). It owns
// SheetColumnMapping + SheetRoute resolution — duplicating it inline silently
// ignored per-portal column config and hardcoded the wrong tab name ("Sayfa1").

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    // Permissive gate: allow admin users (manual UI) AND service callers
    // (acceptViaToken's public token flow). The accept_token validation in
    // acceptViaToken is the security boundary for the public path.
    const isService = !user
      || user.is_service === true
      || (typeof user.email === 'string' && user.email.startsWith('service+'));
    if (!isService && user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // NOTE on parameter naming: the frontend sends `task_id` for legacy reasons,
    // but the value is actually the Junction OFFER ID (`o.id` from /v2/offer/me),
    // which is what `/v1/offer/accept-bulk` expects. The Welocalize docs use
    // "task ids" loosely — endpoint is offer-scoped, so offer IDs are correct.
    const { task_id, task_name, project_name, client_name, account_name, source_language, target_language, word_count, price, due_date, workflow_name } = await req.json();
    if (!task_id) return Response.json({ success: false, error: 'task_id is required' }, { status: 400 });
    const offerId = Number(task_id);
    const resolvedClient = client_name || account_name || '';

    // Kill switch: paused connector must not be bypassed by manual accept.
    const portalRows = await base44.asServiceRole.entities.Portal.filter({ key: 'junction' });
    if (portalRows[0]?.is_active === false) {
      return Response.json({ success: false, error: 'Junction connector is paused' }, { status: 409 });
    }
    // Client attribution: tag every AcceptedTask + Project with the Client.id
    // mapped to this portal so the BMS knows which end-customer this work serves.
    const portalClientId = portalRows[0]?.client_id || null;

    const jwt = Deno.env.get('JUNCTION_JWT');
    const apiKey = Deno.env.get('JUNCTION_API_KEY');
    const apiBase = PROD_BASE;
    // 503 (Service Unavailable) is the correct status for "we can't reach the
    // upstream because we're not configured" — 200-with-error was masking real
    // failures in the UI's success-detection.
    if (!jwt) return Response.json({ success: false, error: 'JUNCTION_JWT not configured' }, { status: 503 });

    // Defensive: send x-api-key when configured (Welocalize UI sends it; not yet enforced).
    const headers = { 'x-pantheon-auth': jwt, 'Content-Type': 'application/json' };
    if (apiKey) headers['x-api-key'] = apiKey;

    // Rate-limit aware retry — Junction default budget is 500/min but bulk-accept
    // can be hammered when the user clicks Accept on a list of 20+ offers in
    // quick succession. 429/5xx → exponential backoff (capped 8s, max 3 retries).
    const acceptUrl = `${apiBase}/v1/offer/accept-bulk`;
    const body = JSON.stringify({ ids: [offerId] });
    let r;
    for (let attempt = 0; attempt <= 3; attempt++) {
      r = await fetch(acceptUrl, { method: 'PUT', headers, body });
      if (r.ok) break;
      if (![429, 502, 503, 504].includes(r.status) || attempt === 3) break;
      await new Promise((res) => setTimeout(res, Math.min(1000 * 2 ** attempt, 8000)));
    }

    if (!r.ok) {
      const text = await r.text();
      // Map Junction's status codes to actionable messages. 401 means the JWT
      // expired (Junction tokens are session-bound, observed multi-day life);
      // 404 means the offer was claimed by someone else (race-condition on
      // /v2/offer/available pool) or never existed; 429 surfaces the
      // 10-req/10-sec cap on the offer-available endpoint family.
      let hint = '';
      if (r.status === 401) hint = 'Junction JWT expired or invalid — refresh JUNCTION_JWT.';
      else if (r.status === 404) hint = 'Offer not found — may have been claimed by another vendor.';
      else if (r.status === 429) hint = 'Junction rate limit hit — retried 3× and gave up.';
      return Response.json(
        { success: false, error: `Junction HTTP ${r.status}: ${hint || text.slice(0, 200)}` },
        { status: 502 }
      );
    }

    const acceptedAt = new Date().toISOString();

    // Best-effort CAT analysis enrichment via /v1/task/{taskId}?$include=taskDetails.
    // Junction's accept-bulk response carries the resulting task ID(s); the offer
    // and task IDs are distinct (offer wraps a task). Fall back gracefully if we
    // can't resolve the task ID or the detail call fails — CAT data is a nice-to-
    // have, not a blocker, and the offer is already claimed at this point.
    const acceptJson = await r.clone().json().catch(() => null);
    const taskIdFromAccept =
      acceptJson?.tasks?.[0]?.id ??
      acceptJson?.data?.[0]?.taskId ??
      acceptJson?.data?.[0]?.id ??
      acceptJson?.[0]?.taskId ??
      acceptJson?.[0]?.id ??
      null;

    let catFields = {};
    if (taskIdFromAccept) {
      try {
        const detailUrl = `${apiBase}/v1/task/${taskIdFromAccept}?$include=taskDetails`;
        const dr = await fetch(detailUrl, { headers });
        if (dr.ok) {
          const detail = await dr.json();
          // Junction returns an array of bands. Map name → our portal-neutral
          // lev_* fields. `mtPostEdit` now lives in its OWN field
          // (lev_mt_post_edit) — previously folded into lev_no_match but the
          // WWC formula treats it separately (weight 0.70 vs newWords 1.00),
          // so collapsing them was incorrect for downstream pricing.
          // Junction has NO 50-74 band and NO Reps-in-fuzzy sub-bands — those
          // lev_* fields stay 0 for Junction rows by design.
          const bands = Array.isArray(detail?.taskDetails) ? detail.taskDetails
            : Array.isArray(detail?.data?.taskDetails) ? detail.data.taskDetails
            : [];
          const qty = (name) => {
            const row = bands.find(b => b?.name === name);
            return Number(row?.unitQuantity) || 0;
          };
          catFields = {
            lev_context:      qty('iceMatches'),
            lev_rep:          qty('repetitions'),
            lev_match100:     qty('oneHundred'),
            lev_9599:         qty('ninetyFive'),
            lev_8594:         qty('eightyFive'),
            lev_7584:         qty('seventyFive'),
            lev_mt_post_edit: qty('mtPostEdit'),
            lev_no_match:     qty('newWords'),
            // Junction TikTok program: regression-validated MTPE weight = 0.70
            // (5 tasks, 0.0% fit error). Per-account override path is open via
            // this field; for now every Junction task gets the program default.
            mt_weight_coefficient: 0.70,
            // Junction proprietary WWC — read it, don't recompute. The
            // weightedWordCount lives at the task root, not inside taskDetails.
            weighted_wc:  Number(detail?.weightedWordCount ?? detail?.data?.weightedWordCount) || 0,
            parser_type:  'Junction',
          };
        } else {
          console.warn(`Junction task detail HTTP ${dr.status} for task ${taskIdFromAccept} — skipping CAT enrichment.`);
        }
      } catch (e) {
        console.warn(`Junction task detail fetch failed for task ${taskIdFromAccept}:`, e.message);
      }
    } else {
      console.warn('Junction accept-bulk response did not carry a task id — skipping CAT enrichment.');
    }

    // Persist guard: Junction has already accepted the offer at this point.
    // If AcceptedTask.create throws, the offer is claimed on Junction but
    // invisible to us — CRITICAL. SystemIssue emails admins; external_ref
    // carries the offer_id so the operator can manually reconcile.
    let savedTask;
    try {
      savedTask = await base44.asServiceRole.entities.AcceptedTask.create({
        portal: 'junction',
        client_id: portalClientId,
        task_id: offerId,
        task_name: task_name || `Offer #${task_id}`,
        project_name: project_name || '',
        client_name: resolvedClient,
        source_language: source_language || '',
        target_language: target_language || '',
        word_count: word_count || 0,
        price: price || 0,
        due_date: due_date || null,
        workflow_name: workflow_name || '',
        accepted_at: acceptedAt,
        matched_rule: 'Manual',
        status: 'accepted',
        sheets_synced: false,
        ...catFields,
      });
    } catch (persistErr) {
      base44.functions.invoke('recordSystemIssue', {
        type: 'accept_persist_failure',
        severity: 'critical',
        portal: 'junction',
        function_name: 'junctionAcceptOffer',
        external_ref: String(offerId),
        dedup_key: `accept:${offerId}`,
        title: `Junction offer ${offerId} claimed upstream but persist failed`,
        description: `Offer "${task_name || `#${offerId}`}" was Accepted on Junction successfully, but AcceptedTask.create threw: ${persistErr.message}\n\nThis offer is now claimed on Junction but invisible to the Hub. Recover by manually creating an AcceptedTask row with task_id=${offerId}.`,
      }).catch((e) => console.error('recordSystemIssue failed:', e.message));
      throw persistErr;
    }

    // BMS Integration: project record for downstream BMS consumption.
    let project = null;
    try {
      project = await base44.asServiceRole.entities.Project.create({
        tenant_id: 'default',
        client_id: portalClientId,
        accepted_task_id: savedTask.id,
        portal: 'junction',
        external_id: `junction:${offerId}`,
        state: 'accepted',
        name: task_name || `Offer #${task_id}`,
        client_name: resolvedClient,
        project_name: project_name || '',
        source_language: source_language || '',
        target_language: target_language || '',
        word_count: word_count || 0,
        price: price || 0,
        currency: 'USD',
        due_date: due_date || null,
        accepted_at: acceptedAt,
        origin: { task_id, task_name, project_name, client_name: resolvedClient, source_language, target_language, word_count, price, due_date },
      });
      base44.functions.invoke('dispatchWebhook', {
        tenant_id: 'default', event: 'project.accepted', project_id: project.id,
      }).catch((e) => console.error('webhook dispatch failed:', e.message));
    } catch (e) {
      console.error('Project create failed:', e.message);
    }

    // Trigger the unified sheet sync (handles SheetColumnMapping + SheetRoute).
    base44.functions.invoke('sheetsSyncPending', {})
      .catch((e) => console.error('sheetsSyncPending trigger failed:', e.message));

    return Response.json({ success: true, accepted_at: acceptedAt, project_id: project?.id || null, sheets_sync: 'queued' });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});