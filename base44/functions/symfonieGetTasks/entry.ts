import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const TENANT_ID = 'ead220ab-1743-4c57-83ae-e055f3401f19';
const SCOPE = 'api://c2e8870d-faef-45ea-919c-b603f97bd0cc/.default';
const BASE_URL = 'https://projects.moravia.com/Api/V5';

async function getToken() {
  const clientId = Deno.env.get('SYMFONIE_CLIENT_ID');
  const clientSecret = Deno.env.get('SYMFONIE_CLIENT_SECRET');
  if (!clientId || !clientSecret) throw new Error('SYMFONIE_CLIENT_ID or SYMFONIE_CLIENT_SECRET is missing');

  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');
  params.append('client_id', clientId);
  params.append('client_secret', clientSecret);
  params.append('scope', SCOPE);

  const tokenRes = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });

  if (!tokenRes.ok) throw new Error('Failed to get token: ' + await tokenRes.text());
  const d = await tokenRes.json();
  return d.access_token;
}

async function fetchAllPages(url, token) {
  const results = [];
  let nextUrl = url;

  while (nextUrl) {
    const res = await fetch(nextUrl, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`API error ${res.status}: ${err}`);
    }

    const data = await res.json();
    const items = data.value || [];
    results.push(...items);

    // OData next link for pagination
    nextUrl = data['@odata.nextLink'] || null;
  }

  return results;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const token = await getToken();

    // Filter directly via OData: State eq 'Order' = tasks awaiting acceptance
    // Note: 'Project' is NOT a navigation property on TaskViewModel — use JobName for project name
    // FinanceRows IS expandable for pricing/word count data
    const url = `${BASE_URL}/Tasks?$filter=State eq 'Order'&$expand=FinanceRows&$orderby=CreatedAt desc&$top=200`;

    const tasks = await fetchAllPages(url, token);

    // Map to clean structure
    const mapped = tasks.map(raw => ({
      id: raw.Id,
      name: raw.Name || '',
      project_id: raw.ProjectId || null,
      project_name: raw.JobName || raw.ProjectName || '',
      source_language: raw.SourceLanguageCode || '',
      target_language: raw.TargetLanguageCode || '',
      word_count: raw.FinanceRows?.find(r => r.BillingUnit === 'Words')?.Quantity || 0,
      price: raw.FinanceRows?.reduce((sum, r) => sum + (r.MaxUsd || 0), 0) || 0,
      due_date: raw.DueDate || null,
      created_at: raw.CreatedAt || null,
      state: raw.State,
      workflow_name: raw.WorkflowName || '',
      job_name: raw.JobName || '',
      service_tag: raw.ServiceTag || '',
    }));

    return Response.json({
      tasks: mapped,
      total: mapped.length
    });
  } catch (error) {
    console.error('symfonieGetTasks error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});