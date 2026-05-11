const TENANT_ID = Deno.env.get('SYMFONIE_TENANT_ID') || 'ead220ab-1743-4c57-83ae-e055f3401f19';
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
    nextUrl = data['@odata.nextLink'] || null;
  }

  return results;
}

// Billing unit codes from Symfonie API
const BILLING_UNIT_NAMES = {
  1: 'Words',
  2: 'Characters',
  3: 'Lines',
  4: 'Pages',
  5: 'Hours',
  6: 'Minutes',
  7: 'Segments',
  8: 'Files',
  'Words': 'Words',
  'Characters': 'Characters',
  'Lines': 'Lines',
  'Pages': 'Pages',
  'Hours': 'Hours',
  'Minutes': 'Minutes',
  'Segments': 'Segments',
  'Files': 'Files',
};

Deno.serve(async (req) => {
  try {
    const token = await getToken();

    const url = `${BASE_URL}/Tasks?$filter=State eq 'Order'&$expand=FinanceRows&$orderby=CreatedAt desc&$top=200`;
    const tasks = await fetchAllPages(url, token);

    const mapped = tasks.map(raw => {
      const financeRows = (raw.FinanceRows || []).map(r => ({
        id: r.Id,
        billing_unit: BILLING_UNIT_NAMES[r.BillingUnit] || String(r.BillingUnit),
        billing_unit_code: r.BillingUnit,
        quantity: r.Quantity || 0,
        unit_price_usd: r.UnitPriceUsd || r.UnitPrice || 0,
        min_usd: r.MinUsd || 0,
        max_usd: r.MaxUsd || 0,
        total_usd: r.TotalUsd || r.MaxUsd || 0,
        name: r.Name || '',
        description: r.Description || '',
        is_confirmed: r.IsConfirmed || false,
        cat_analysis: r.CatAnalysis || null,
      }));

      // Word count: find the Words billing row
      const wordRow = financeRows.find(r => r.billing_unit === 'Words' || r.billing_unit === 'Word');
      const wordCount = wordRow?.quantity || 0;
      const totalMaxUsd = financeRows.reduce((sum, r) => sum + (r.max_usd || 0), 0);
      const totalMinUsd = financeRows.reduce((sum, r) => sum + (r.min_usd || 0), 0);
      const totalConfirmedUsd = financeRows
        .filter(r => r.is_confirmed)
        .reduce((sum, r) => sum + (r.total_usd || 0), 0);

      return {
        id: raw.Id,
        name: raw.Name || '',
        project_id: raw.ProjectId || null,
        project_name: raw.JobName || raw.ProjectName || '',
        source_language: raw.SourceLanguageCode || '',
        target_language: raw.TargetLanguageCode || '',
        word_count: wordCount,
        price: totalMaxUsd,
        price_min_usd: totalMinUsd,
        price_max_usd: totalMaxUsd,
        price_confirmed_usd: totalConfirmedUsd,
        due_date: raw.DueDate || null,
        created_at: raw.CreatedAt || null,
        updated_at: raw.UpdatedAt || null,
        state: raw.State,
        workflow_name: raw.WorkflowName || '',
        job_name: raw.JobName || '',
        service_tag: raw.ServiceTag || '',
        description: raw.Description || '',
        instructions: raw.Instructions || '',
        assigned_to: raw.AssignedToName || raw.AssignedTo || '',
        task_type: raw.TaskType || raw.Type || '',
        cat_tool: raw.CatTool || '',
        finance_rows: financeRows,
        finance_summary: {
          total_rows: financeRows.length,
          word_row: wordRow || null,
          total_min_usd: totalMinUsd,
          total_max_usd: totalMaxUsd,
          total_confirmed_usd: totalConfirmedUsd,
          billing_units: [...new Set(financeRows.map(r => r.billing_unit))],
        }
      };
    });

    return Response.json({
      tasks: mapped,
      total: mapped.length
    });
  } catch (error) {
    console.error('symfonieGetTasks error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});