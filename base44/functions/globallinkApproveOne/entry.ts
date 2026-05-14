// Approve a single GlobalLinkSubmission — the UI action handler.
//
// Critical orchestration (in order — DO NOT reorder):
//   1. Fresh-ticket fetch: submissionTargetSearch.pd → match by submissionId.
//      Cached/stale tickets silently no-op the claim, so we re-fetch every time.
//   2. submissionLanguageSearch.pd → enumerate target locales available on
//      this submission right now.
//   3. Locale-family intersection: Portal.allowed_language_families (e.g.
//      ['tr','ar']) × available locales, via family-prefix match. Family
//      'tr' matches 'tr-TR', 'tr_TR', 'tr-x-foo' but NOT 'turkish-custom'.
//   4. globallinkClaim with the matched locales (multi-language single claim).
//   5. Flip all matching DB rows (same submission_ticket, matched target_languages)
//      to status=claimed.
//   6. Create one AcceptedTask + Project per claimed language → fire webhook.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const DEFAULT_BASE = 'https://gle-prod-eu.transperfect.com/PD';

// Family-prefix matcher — locale-agnostic. 'tr' matches 'tr-TR', 'tr_TR',
// 'tr-x-foo'; 'ar' matches 'ar-SA', 'ar-EG', 'ar-MSA'. Avoids matching
// 'turkish-custom' or 'arabic-foo' (no separator after the family prefix).
function localeMatchesFamily(locale, family) {
  if (!locale || !family) return false;
  const loc = String(locale).toLowerCase();
  const fam = String(family).toLowerCase();
  return loc === fam || loc.startsWith(fam + '-') || loc.startsWith(fam + '_');
}

function filterLocalesByFamilies(locales, families) {
  if (!Array.isArray(families) || families.length === 0) return locales; // empty = allow all
  return locales.filter((loc) => families.some((fam) => localeMatchesFamily(loc, fam)));
}

function buildHeaders(jwt, contextUser) {
  return {
    'Authorization': `Bearer ${jwt}`,
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    'ajaxRequest': 'true',
    'appVersion': '11.5.0',
    'contextUser': contextUser,
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
    const { submission_row_id } = body || {};
    if (!submission_row_id) {
      return Response.json({ success: false, error: 'submission_row_id is required' }, { status: 400 });
    }

    const row = await base44.asServiceRole.entities.GlobalLinkSubmission.get(submission_row_id).catch(() => null);
    if (!row) return Response.json({ success: false, error: 'submission not found' }, { status: 404 });
    if (row.status === 'claimed') {
      return Response.json({ success: true, already: true, message: 'Already claimed' });
    }

    // Auth setup
    const tokenRes = await base44.asServiceRole.functions.invoke('getGlobalLinkToken', {});
    if (!tokenRes?.data?.token_value) {
      return Response.json({ success: false, error: tokenRes?.data?.error || 'No cached GlobalLink JWT available' }, { status: 503 });
    }
    const jwt = tokenRes.data.token_value;
    const contextUser = Deno.env.get('GLOBALLINK_CONTEXT_USER') || 'VerbatoTrans';
    const base = (Deno.env.get('GLOBALLINK_BASE_URL') || DEFAULT_BASE).replace(/\/$/, '');
    const headers = buildHeaders(jwt, contextUser);

    // 1) FRESH TICKET — cached/stale tickets silently no-op. Match by submissionId.
    const submissionIdRaw = row.submission_id;
    const listResp = await fetch(`${base}/submissionTargetSearch.pd`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ folder: 'AVAILABLE_SUBMISSION', entityTickets: [], parentEntityTickets: [], index: 0, size: 100 }),
    });
    if (!listResp.ok) {
      const text = await listResp.text();
      return Response.json({ success: false, error: `submissionTargetSearch.pd HTTP ${listResp.status}: ${text.slice(0, 200)}` }, { status: 502 });
    }
    const listData = await listResp.json();
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

    // 2) Enumerate target locales on this submission
    const langResp = await fetch(`${base}/submissionLanguageSearch.pd`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ submissionTicket: freshTicket, folder: 'AVAILABLE_SUBMISSION' }),
    });
    if (!langResp.ok) {
      const text = await langResp.text();
      return Response.json({ success: false, error: `submissionLanguageSearch.pd HTTP ${langResp.status}: ${text.slice(0, 200)}` }, { status: 502 });
    }
    const langData = await langResp.json();
    const availableItems = langData?.items || [];
    const availableLocales = availableItems
      .map((i) => i?.languageDirectionPreview?.targetLanguage?.locale)
      .filter(Boolean);

    // 3) Locale-family intersection
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

    // 4) Claim (multi-language single chain)
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

    // 5) + 6) For each claimed locale, mark the corresponding row claimed,
    //         create AcceptedTask + Project, fire webhook.
    const claimedSet = new Set(claimable.map((s) => s.toLowerCase()));
    const created = [];

    for (const claimedLocale of claimable) {
      const matchRow = sameSubmissionRows.find(
        (r) => (r.target_language || '').toLowerCase() === claimedLocale.toLowerCase()
      ) || row; // fallback to the originating row if no per-language entry exists

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

    // Any same-submission rows whose locale was NOT in the claim → mark skipped
    // (Cenk doesn't onboard them; submission is gone from Available anyway.)
    for (const r of sameSubmissionRows) {
      const loc = (r.target_language || '').toLowerCase();
      if (loc && !claimedSet.has(loc) && r.status === 'available') {
        await base44.asServiceRole.entities.GlobalLinkSubmission.update(r.id, {
          status: 'skipped',
          claim_error: `Not in allowed_language_families; submission claimed for: ${claimable.join(', ')}`,
        }).catch(() => null);
      }
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