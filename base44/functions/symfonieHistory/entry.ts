// Son N gün içindeki Completed + Approved task'ları çek.
// Sheet'e YAZMAZ — sadece UI için historical view.
// Symfonie 503'leri için retry-with-backoff var.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const TENANT_ID = Deno.env.get('SYMFONIE_TENANT_ID') || 'ead220ab-1743-4c57-83ae-e055f3401f19';
const SCOPE = 'api://c2e8870d-faef-45ea-919c-b603f97bd0cc/.default';
const BASE_URL = 'https://projects.moravia.com/Api/V5';

async function getToken() {
  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');
  params.append('client_id', Deno.env.get('SYMFONIE_CLIENT_ID'));
  params.append('client_secret', Deno.env.get('SYMFONIE_CLIENT_SECRET'));
  params.append('scope', SCOPE);
  const r = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString()
  });
  if (!r.ok) throw new Error('Token failed');
  return (await r.json()).access_token;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchWithRetry(url, token, maxRetries = 4) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' } });
    if (res.ok) return await res.json();
    if ([429, 502, 503, 504].includes(res.status) && attempt < maxRetries) {
      await sleep(Math.min(1000 * 2 ** attempt, 8000));
      continue;
    }
    const err = await res.text();
    throw new Error(`API ${res.status}: ${err.slice(0, 200)}`);
  }
}

Deno.serve(async (req) => {
  try {
    // Admin gate: exposes Symfonie history (financials, PII).
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (user !== null && user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { days = 30 } = await req.json().catch(() => ({}));
    const token = await getToken();

    const since = new Date(Date.now() - days * 86400000).toISOString();
    // Completed + Approved birlikte — UpdatedAt >= since filter
    // Expand'siz çekiyoruz çünkü büyük datasetlerde 502 veriyor.
    const filter = `(State eq 'Completed' or State eq 'Approved') and UpdatedAt ge ${since}`;
    const url = `${BASE_URL}/Tasks?$filter=${encodeURIComponent(filter)}&$orderby=UpdatedAt desc&$top=500`;

    const data = await fetchWithRetry(url, token);
    const tasks = (data.value || []).map(t => ({
      id: t.Id,
      name: t.Name || '',
      state: t.State,
      project_name: t.Project?.Name || '',
      account_code: t.Project?.Code || '',
      source_language: t.SourceLanguageCode || '',
      target_language: t.TargetLanguageCode || '',
      workflow_name: t.WorkflowName || '',
      service_tag: t.ServiceTag || '',
      due_date: t.DueDate || null,
      completed_date: t.CompletedDate || null,
      approve_date: t.ApproveDate || null,
      updated_at: t.UpdatedAt || null,
      created_at: t.CreatedAt || null,
    }));

    return Response.json({ tasks, total: tasks.length, days, since });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});