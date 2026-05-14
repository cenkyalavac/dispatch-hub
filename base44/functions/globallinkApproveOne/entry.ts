// Approve a single GlobalLinkSubmission — the UI action handler.
//
// All PD calls go through broker /proxy/pd (page-context fetch).
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
    const { submission_row_id } = body || {};
    if (!submission_row_id) {
      return Response.json({ success: false, error: 'submission_row_id is required' }, { status: 400 });
    }

    const row = await base44.asServiceRole.entities.GlobalLinkSubmission.get(submission_row_id).catch(() => null);
    if (!row) return Response.json({ success: false, error: 'submission not found' }, { status: 404 });
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

    // 4) Claim.
    const claimRes = await base44.asServiceRole.functions.invoke('globallinkClaim', {
      submission_ticket: freshTicket,
      target_languages: claimable,
    });
    const claimData = claimRes?.data || {};
    if (!claimData.success) {
      const errMsg = claimData.error || 'claim failed';
      await base44.asServiceRole.entities.GlobalLinkSubmission.update(row.id, {
        status: 'error',
        claim_error: errMsg,
      });
      return Response.json({ success: false, error: errMsg, reasons: claimData.reasons || null }, { status: 502 });
    }

    const acceptedAt = new Date().toISOString();
    const sameSubmissionRows = await base44.asServiceRole.entities.GlobalLinkSubmission
      .filter({ submission_ticket: row.submission_ticket });

    const created = [];

    for (const claimedLocale of claimable) {
      const matchRow = sameSubmissionRows.find(
        (r) => (r.target_language || '').toLowerCase() === claimedLocale.toLowerCase()
      ) || row;

      const acceptedTask = await base44.asServiceRole.entities.AcceptedTask.create({
        portal: 'globallink',
        task_id: Number(matchRow.submission_id) || matchRow.submission_ticket,
        task_name: matchRow.submission_name || `Submission ${matchRow.submission_id || matchRow.submission_ticket}`,
        project_name: matchRow.submission_name || '',
        client_name: matchRow.client_name || '',
        source_language: matchRow.source_language || '',
        target_language: claimedLocale,
        word_count: matchRow.word_count || 0,
        price: 0,
        due_date: matchRow.due_date || null,
        accepted_at: acceptedAt,
        matched_rule: 'manual:approve',
        status: 'accepted',
        sheets_synced: false,
      });

      await base44.asServiceRole.entities.GlobalLinkSubmission.update(matchRow.id, {
        status: 'claimed',
        claimed_at: acceptedAt,
        accepted_task_id: acceptedTask.id,
        claim_error: null,
      }).catch((e) => console.error('row claim update failed:', e.message));

      try {
        const project = await base44.asServiceRole.entities.Project.create({
          tenant_id: 'default',
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
        base44.asServiceRole.functions.invoke('dispatchWebhook', {
          tenant_id: 'default', event: 'project.accepted', project_id: project.id,
        }).catch((e) => console.error('webhook dispatch failed:', e.message));
      } catch (e) {
        console.error(`Project create failed for ${claimedLocale}:`, e.message);
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
    });
  } catch (error) {
    console.error('globallinkApproveOne error:', error.message);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});