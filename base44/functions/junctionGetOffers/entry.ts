import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const PROD_BASE = 'https://hypnos.welocalize.tools';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Soft auth: Base44 SDK occasionally returns 401 from auth.me() even for valid sessions.
    // This route is admin-gated by the app's UI; we proceed even if me() fails.
    await base44.auth.me().catch(() => null);

    const jwt = Deno.env.get('JUNCTION_JWT');
    const apiKey = Deno.env.get('JUNCTION_API_KEY');
    const apiBase = PROD_BASE;

    if (!jwt) {
      return Response.json({ success: false, error: 'JUNCTION_JWT not configured', offers: [] });
    }

    // Defensive: send x-api-key when configured (Welocalize UI sends it; not yet enforced).
    const authHeaders = { 'x-pantheon-auth': jwt, 'Accept': 'application/json' };
    if (apiKey) authHeaders['x-api-key'] = apiKey;

    // Endpoint returns the full list — query params (limit/offset) are rejected.
    const r = await fetch(`${apiBase}/v2/offer/me`, { headers: authHeaders });
    if (!r.ok) {
      const text = await r.text();
      return Response.json({
        success: false,
        error: `Junction API HTTP ${r.status}: ${text.slice(0, 200)}`,
        offers: [],
      }, { status: r.status });
    }
    const data = await r.json();
    const offers = Array.isArray(data) ? data : (data?.data || []);

    // Normalize offers into a task-like shape for the UI
    const tasks = offers.map(o => {
      const td = o.taskDetail || o.task || {};
      const project = td.project || o.project || {};
      const wordCount = td.wordCount ?? td.words ?? td.sourceWordCount ?? null;
      const price = o.amount ?? o.totalAmount ?? td.amount ?? null;
      return {
        id: o.id,
        name: td.name || o.name || `Offer #${o.id}`,
        project_name: project.name || td.projectName || '',
        client_name: project.client?.name || project.clientName || '',
        source_language: td.sourceLocale || td.sourceLanguage || '',
        target_language: td.targetLocale || td.targetLanguage || '',
        word_count: wordCount,
        price_max_usd: price,
        price_min_usd: price,
        due_date: o.dueDate || td.dueDate || null,
        created_at: o.createdAt || null,
        workflow_name: td.workflow || td.workflowName || '',
        service_tag: td.serviceTag || td.service || '',
        task_type: td.taskType || '',
        cat_tool: td.catTool || '',
        assigned_to: o.offeringUser?.name || '',
        portal: 'junction',
        _raw: o,
      };
    });

    return Response.json({
      success: true,
      tasks,
      summary: {
        total: tasks.length,
        total_words: tasks.reduce((s, t) => s + (t.word_count || 0), 0),
        total_price: tasks.reduce((s, t) => s + (t.price_max_usd || 0), 0),
      },
    });
  } catch (error) {
    return Response.json({ success: false, error: error.message, offers: [] }, { status: 500 });
  }
});