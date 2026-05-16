import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Returns the Available submissions list normalized into the same task shape that
// PendingTasks and the rule engine expect. One submission can have multiple target
// languages — we expand each language pair into its own pending task row.
//
// All PD calls go through the broker's /proxy/pd endpoint (page-context fetch).

const FOLDER = 'AVAILABLE_SUBMISSION';

// Broker envelope evolved: it now returns { status, redirected, contentType, bodyJson, bodyText }.
// Older code expected { status, body }. We fall back through both shapes so the hub
// stays compatible with either broker version.
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
    await base44.auth.me().catch(() => null);

    const brokerUrl = (Deno.env.get('BROKER_URL') || '').replace(/\/$/, '');
    const brokerKey = Deno.env.get('BROKER_KEY');
    if (!brokerUrl || !brokerKey) {
      return Response.json({ success: false, error: 'BROKER_URL or BROKER_KEY secret missing', tasks: [] }, { status: 503 });
    }

    const listData = await pdProxy(brokerUrl, brokerKey, 'submissionTargetSearch.pd', {
      folder: FOLDER, entityTickets: [], parentEntityTickets: [], index: 0, size: 100,
    });
    const submissions = listData?.items || [];

    const tasks = [];
    const BATCH = 5;
    for (let i = 0; i < submissions.length; i += BATCH) {
      const slice = submissions.slice(i, i + BATCH);
      const pairs = await Promise.all(slice.map((s) =>
        pdProxy(brokerUrl, brokerKey, 'submissionLanguageSearch.pd', { submissionTicket: s.ticket, folder: FOLDER })
          .then((d) => ({ s, items: d?.items || [] }))
          .catch(() => ({ s, items: [] }))
      ));
      for (const { s, items } of pairs) {
        // Newer broker returns a single object with top-level
        // languageDirectionPreview; older format returned items[]. Support both
        // so the pending list stays accurate across broker upgrades.
        const langItems = (items && items.length > 0)
          ? items
          : (s?.languageDirectionPreview ? [s] : []);
        if (langItems.length === 0) {
          tasks.push({
            id: `${s.ticket}`,
            name: s.submissionName || `Submission ${s.submissionId}`,
            project_name: s.projectName || s.submissionName || '',
            client_name: s.paClientName || s.clientName || s.organizationName || '',
            source_language: s.sourceLocale || s.sourceLanguage || '',
            target_language: '',
            word_count: Number(s.wordCount) || 0,
            price_max_usd: null,
            price_min_usd: null,
            due_date: s.dueDate?.date ? new Date(s.dueDate.date).toISOString() : (s.dueDate || null),
            created_at: s.createdAt || null,
            workflow_name: '',
            service_tag: '',
            task_type: '',
            cat_tool: '',
            assigned_to: '',
            portal: 'globallink',
            submission_id: String(s.submissionId ?? ''),
            submission_ticket: s.ticket,
            _raw: s,
          });
          continue;
        }
        for (const it of langItems) {
          const ldp = it.languageDirectionPreview || {};
          const tgtLoc = it.targetLanguage?.locale || ldp.targetLanguage?.locale || '';
          const srcLoc = it.sourceLanguage?.locale || ldp.sourceLanguage?.locale || s.sourceLocale || '';
          const phaseDue = it.subPhaseStatusDataHolders?.[0]?.phaseStatusData?.[0]?.phaseDueDate?.date
                        ?? it.phaseStatusData?.[0]?.phaseDueDate?.date
                        ?? it.phaseDueDate
                        ?? null;
          // Same coercion shape as globallinkPoll — the previous nested ternary
          // had ambiguous precedence and could pass a raw epoch number through.
          const _coerceDue = (v) => {
            if (v == null) return null;
            if (typeof v === 'number') return new Date(v).toISOString();
            if (typeof v === 'object' && v.date) return new Date(v.date).toISOString();
            if (typeof v === 'string') {
              const d = new Date(v);
              return isNaN(d.getTime()) ? null : d.toISOString();
            }
            return null;
          };
          const dueIso = _coerceDue(phaseDue) || _coerceDue(s.dueDate);
          const phaseName = it.subPhaseStatusDataHolders?.[0]?.phaseStatusData?.[0]?.phaseName
                        || it.phaseStatusData?.[0]?.phaseName
                        || it.phase || '';
          const workflowName = it.subPhaseStatusDataHolders?.[0]?.workflow || it.workflow || '';
          tasks.push({
            id: `${s.ticket}:${tgtLoc}`,
            name: s.submissionName || `Submission ${s.submissionId}`,
            project_name: s.projectName || s.submissionName || '',
            client_name: s.paClientName || s.clientName || s.organizationName || '',
            source_language: srcLoc,
            target_language: tgtLoc,
            word_count: Number(s.wordCount) || 0,
            price_max_usd: null,
            price_min_usd: null,
            due_date: dueIso,
            created_at: s.createdAt || null,
            workflow_name: workflowName,
            service_tag: phaseName,
            task_type: phaseName,
            cat_tool: '',
            assigned_to: '',
            portal: 'globallink',
            phase_name: phaseName,
            submission_id: String(s.submissionId ?? ''),
            submission_ticket: s.ticket,
            account_id: s.paClientTicket || '',
            _raw: { submission: s, language: it },
          });
        }
      }
    }

    return Response.json({
      success: true,
      tasks,
      summary: {
        total: tasks.length,
        total_words: tasks.reduce((sum, t) => sum + (t.word_count || 0), 0),
        total_price: 0,
      },
    });
  } catch (error) {
    return Response.json({ success: false, error: error.message, tasks: [] }, { status: 500 });
  }
});