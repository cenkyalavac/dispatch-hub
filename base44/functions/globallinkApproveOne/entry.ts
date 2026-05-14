// Approve a single GlobalLinkSubmission — the UI action handler.
// Orchestrates: call globallinkClaim → flip status → create AcceptedTask + Project → fire webhook.
// Mirrors the Symfonie/Junction "rule-accept" path so downstream BMS sees GlobalLink
// claims through the same pipeline.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

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

    const target = row.target_language || 'tr-TR';

    // 1) Call the claim wrapper
    const claimRes = await base44.asServiceRole.functions.invoke('globallinkClaim', {
      submission_ticket: row.submission_ticket,
      target_language: target,
    });
    const claimData = claimRes?.data || {};
    if (!claimData.success) {
      const errMsg = claimData.error || 'claim failed';
      await base44.asServiceRole.entities.GlobalLinkSubmission.update(row.id, {
        status: 'error',
        claim_error: errMsg,
      });
      return Response.json({ success: false, error: errMsg }, { status: 502 });
    }

    const acceptedAt = new Date().toISOString();

    // 2) Create AcceptedTask (mirrors Symfonie/Junction shape so History page works)
    const acceptedTask = await base44.asServiceRole.entities.AcceptedTask.create({
      portal: 'globallink',
      task_id: row.submission_id ? Number(row.submission_id) || row.submission_ticket : row.submission_ticket,
      task_name: row.submission_name || `Submission ${row.submission_id || row.submission_ticket}`,
      project_name: row.submission_name || '',
      client_name: row.client_name || '',
      source_language: row.source_language || '',
      target_language: target,
      word_count: row.word_count || 0,
      price: 0,
      due_date: row.due_date || null,
      accepted_at: acceptedAt,
      matched_rule: 'manual:approve',
      status: 'accepted',
      sheets_synced: false,
    });

    // 3) Mark the submission row claimed
    await base44.asServiceRole.entities.GlobalLinkSubmission.update(row.id, {
      status: 'claimed',
      claimed_at: acceptedAt,
      accepted_task_id: acceptedTask.id,
      claim_error: null,
    });

    // 4) Create Project + fire webhook (BMS pipeline)
    try {
      const project = await base44.asServiceRole.entities.Project.create({
        tenant_id: 'default',
        accepted_task_id: acceptedTask.id,
        portal: 'globallink',
        external_id: `globallink:${row.submission_ticket}:${target}`,
        state: 'accepted',
        name: row.submission_name || '',
        client_name: row.client_name || '',
        project_name: row.submission_name || '',
        source_language: row.source_language || '',
        target_language: target,
        word_count: row.word_count || 0,
        price: 0,
        currency: 'USD',
        due_date: row.due_date || null,
        accepted_at: acceptedAt,
        origin: { submission_ticket: row.submission_ticket, submission_id: row.submission_id, raw: row.raw || null },
      });
      base44.asServiceRole.functions.invoke('dispatchWebhook', {
        tenant_id: 'default', event: 'project.accepted', project_id: project.id,
      }).catch((e) => console.error('webhook dispatch failed:', e.message));
    } catch (e) {
      console.error(`Project create failed for submission ${row.submission_ticket}:`, e.message);
    }

    return Response.json({
      success: true,
      submission_ticket: row.submission_ticket,
      target_language: target,
      accepted_task_id: acceptedTask.id,
      process_uuid: claimData.process_uuid,
    });
  } catch (error) {
    console.error('globallinkApproveOne error:', error.message);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});