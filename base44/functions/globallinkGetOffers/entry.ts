import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Returns the Available submissions list normalized into the same task shape that
// PendingTasks and the rule engine expect. One submission can have multiple target
// languages — we expand each language pair into its own pending task row.
const DEFAULT_BASE = 'https://gle-prod-eu.transperfect.com/PD';
const FOLDER = 'AVAILABLE_SUBMISSION';

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

async function fetchSubmissions(base, headers) {
  const res = await fetch(`${base}/submissionTargetSearch.pd`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ folder: FOLDER, entityTickets: [], parentEntityTickets: [], index: 0, size: 100 }),
  });
  if (!res.ok) throw new Error(`submissionTargetSearch.pd HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return data?.items || [];
}

async function fetchLanguagePairs(base, headers, submissionTicket) {
  const res = await fetch(`${base}/submissionLanguageSearch.pd`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ submissionTicket, folder: FOLDER }),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data?.items || [];
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    await base44.auth.me().catch(() => null);

    const jwt = Deno.env.get('GLOBALLINK_JWT');
    const contextUser = Deno.env.get('GLOBALLINK_CONTEXT_USER');
    const base = (Deno.env.get('GLOBALLINK_BASE_URL') || DEFAULT_BASE).replace(/\/$/, '');

    if (!jwt || !contextUser) {
      return Response.json({
        success: false,
        error: 'GLOBALLINK_JWT and GLOBALLINK_CONTEXT_USER must be configured.',
        tasks: [],
      });
    }

    const headers = buildHeaders(jwt, contextUser);
    const submissions = await fetchSubmissions(base, headers);

    // Expand each submission into its language pairs. Run in small parallel batches to
    // avoid hammering PD when many submissions are open.
    const tasks = [];
    const BATCH = 5;
    for (let i = 0; i < submissions.length; i += BATCH) {
      const slice = submissions.slice(i, i + BATCH);
      const pairs = await Promise.all(slice.map(s => fetchLanguagePairs(base, headers, s.ticket).then(items => ({ s, items }))));
      for (const { s, items } of pairs) {
        if (!items || items.length === 0) {
          tasks.push({
            id: `${s.ticket}`,
            name: s.submissionName || `Submission ${s.submissionId}`,
            project_name: s.submissionName || '',
            client_name: s.clientName || s.organizationName || '',
            source_language: s.sourceLocale || s.sourceLanguage || '',
            target_language: '',
            word_count: Number(s.wordCount) || 0,
            price_max_usd: null,
            price_min_usd: null,
            due_date: s.dueDate || null,
            created_at: s.createdAt || null,
            workflow_name: '',
            service_tag: '',
            task_type: '',
            cat_tool: '',
            assigned_to: '',
            portal: 'globallink',
            _raw: s,
          });
          continue;
        }
        for (const it of items) {
          tasks.push({
            id: `${s.ticket}:${it.targetLanguage?.locale || it.languageDirectionPreview || ''}`,
            name: s.submissionName || `Submission ${s.submissionId}`,
            project_name: s.submissionName || '',
            client_name: s.clientName || s.organizationName || '',
            source_language: it.sourceLanguage?.locale || s.sourceLocale || '',
            target_language: it.targetLanguage?.locale || '',
            word_count: Number(it.wordCount) || Number(s.wordCount) || 0,
            price_max_usd: null,
            price_min_usd: null,
            due_date: it.phaseDueDate || s.dueDate || null,
            created_at: s.createdAt || null,
            workflow_name: it.workflow || '',
            service_tag: it.phase || '',
            task_type: it.phase || '',
            cat_tool: '',
            assigned_to: '',
            portal: 'globallink',
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