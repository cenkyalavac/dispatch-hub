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
  1: 'Words', 2: 'Characters', 3: 'Lines', 4: 'Pages',
  5: 'Hours', 6: 'Minutes', 7: 'Segments', 8: 'Files',
  Words: 'Words', Characters: 'Characters', Lines: 'Lines', Pages: 'Pages',
  Hours: 'Hours', Minutes: 'Minutes', Segments: 'Segments', Files: 'Files',
};

Deno.serve(async (req) => {
  try {
    const token = await getToken();

    // Expand:
    //   FinanceRows + PurchaseOrder + SalesOrder    → financial detail
    //   Project + Project/Customer                  → account / division / project code
    //   CustomFields, Tags, Requestors, Assignees   → metadata
    // PurchaseOrder/SalesOrder are complex (inline) properties on TaskAmounts — they arrive without $expand.
    // Project is structural too in practice (its V5 OData type rejects $expand) — inline if present.
    // V5 Tasks endpoint only accepts FinanceRows in $expand on this tenant.
    // Other collections (Tags, Project, Requestors, Assignees, CustomFields) arrive inline.
    const expand = 'FinanceRows';

    const url = `${BASE_URL}/Tasks?$filter=State eq 'Order'&$expand=${encodeURIComponent(expand)}&$orderby=CreatedAt desc&$top=200`;
    const tasks = await fetchAllPages(url, token);

    // Resolve account/division via Jobs → Projects → Customers.
    // (Tasks endpoint won't expand Project on this tenant, so we resolve in two batched lookups.)
    const jobIds = [...new Set(tasks.map(t => t.JobId).filter(Boolean))];
    const jobMap = new Map();
    const projectMap = new Map();

    async function batchLookup(resource, ids) {
      // Batch in chunks of 20 with `Id eq X or Id eq Y` (V5 OData doesn't accept `Id in (…)`).
      const out = [];
      for (let i = 0; i < ids.length; i += 20) {
        const chunk = ids.slice(i, i + 20);
        const filter = chunk.map(id => `Id eq ${id}`).join(' or ');
        const items = await fetchAllPages(
          `${BASE_URL}/${resource}?$filter=${encodeURIComponent(filter)}&$top=${chunk.length}`,
          token
        );
        out.push(...items);
      }
      return out;
    }

    if (jobIds.length > 0) {
      const jobs = await batchLookup('Jobs', jobIds);
      jobs.forEach(j => jobMap.set(j.Id, j));
      console.log(`Jobs resolved: ${jobs.length}/${jobIds.length}`);
      if (jobs[0]) console.log('Sample job keys:', Object.keys(jobs[0]).join(','));

      const projectIds = [...new Set(jobs.map(j => j.ProjectId).filter(Boolean))];
      if (projectIds.length > 0) {
        const projects = await batchLookup('Projects', projectIds);
        projects.forEach(p => projectMap.set(p.Id, p));
        console.log(`Projects resolved: ${projects.length}/${projectIds.length}`);
        if (projects[0]) console.log('Sample project keys:', Object.keys(projects[0]).join(','), 'Customer:', JSON.stringify(projects[0].Customer));
      } else {
        console.log('No ProjectId on any job');
      }
    }

    const mapped = tasks.map(raw => {
      const financeRows = (raw.FinanceRows || []).map(r => {
        const po = r.PurchaseOrder || null;
        const so = r.SalesOrder || null;
        return {
          id: r.Id,
          billing_unit: BILLING_UNIT_NAMES[r.BillingUnit] || String(r.BillingUnit),
          billing_unit_code: r.BillingUnit,
          quantity: Number(r.Quantity) || 0,
          unit_price_usd: Number(r.UnitPriceUsd ?? r.UnitPrice ?? 0),
          min_usd: Number(r.MinUsd) || 0,
          max_usd: Number(r.MaxUsd) || 0,
          total_usd: Number(r.TotalUsd ?? r.MaxUsd ?? 0),
          name: r.Name || '',
          description: r.Description || r.Note || '',
          is_confirmed: r.IsConfirmed || false,
          is_sales_price_calculated: r.IsSalesPriceCalculated || false,
          is_purchase_price_calculated: r.IsPurchasePriceCalculated || false,
          service_tag: r.ServiceTag || '',
          requestor_login: r.RequestorLogin || '',
          purchase_order: po && {
            id: po.Id,
            po_number: po.PoNumber || '',
            activity_no: po.ActivityNo || '',
            model_name: po.ModelName || '',
            state: po.State,
            is_billable: po.IsBillable,
            is_proposal: po.IsProposal,
            is_rejected: po.IsRejected,
            proposal_reason: po.ProposalReason || '',
            rejection_reason: po.RejectionReason || '',
            approved_at: po.ApprovedAt || null,
            post_date: po.PostDate || null,
            discount: Number(po.Discount) || 0,
          },
          sales_order: so && {
            id: so.Id,
            po_number: so.PoNumber || '',
            activity_no: so.ActivityNo || '',
            model_name: so.ModelName || '',
            state: so.State,
            is_billable: so.IsBillable,
            is_proposal: so.IsProposal,
            approved_at: so.ApprovedAt || null,
            post_date: so.PostDate || null,
          },
        };
      });

      const wordRow = financeRows.find(r => r.billing_unit === 'Words' || r.billing_unit === 'Word');
      const wordCount = wordRow?.quantity || 0;
      const totalMaxUsd = financeRows.reduce((s, r) => s + (r.max_usd || 0), 0);
      const totalMinUsd = financeRows.reduce((s, r) => s + (r.min_usd || 0), 0);
      const totalConfirmedUsd = financeRows.filter(r => r.is_confirmed).reduce((s, r) => s + (r.total_usd || 0), 0);
      const billableCount = financeRows.filter(r => r.purchase_order?.is_billable).length;
      const proposalCount = financeRows.filter(r => r.purchase_order?.is_proposal).length;

      // Project / Customer = "account" + "project / division"
      // Resolved via the Jobs → Projects pre-fetch above (since Tasks expand is restricted).
      const job = jobMap.get(raw.JobId) || null;
      const project = job ? projectMap.get(job.ProjectId) : null;
      const customer = project?.Customer || null;

      // Custom fields → flatten name:value map
      const customFields = (raw.CustomFields || []).reduce((acc, cf) => {
        const key = cf.Name || cf.DefinitionName || cf.Key;
        if (key) acc[key] = cf.Value ?? cf.StringValue ?? cf.TextValue ?? '';
        return acc;
      }, {});

      const requestors = (raw.Requestors || []).map(r => r.Login || r.Name || r.Email).filter(Boolean);
      const assignees = (raw.Assignees || []).map(a => a.Login || a.Name || a.Email).filter(Boolean);

      return {
        id: raw.Id,
        external_id: raw.ExternalId || '',
        name: raw.Name || '',

        // Project / Account / Customer
        project_id: project?.Id ?? job?.ProjectId ?? null,
        project_name: project?.Name || '',
        project_code: project?.Code || '',
        project_state: project?.ProjectState || null,
        project_manager_id: project?.ProjectManagerId || null,
        account_name: customer?.Name || '',       // Symfonie "Customer" = account
        account_code: customer?.Code || '',
        account_id: customer?.Id || null,

        // Job / workflow — Job is the "division" tier between Project and Task
        job_id: raw.JobId || null,
        job_name: raw.JobName || job?.Name || '',
        job_external_id: job?.ExternalId || '',
        job_identifier: job?.Identifier || '',
        workflow_id: raw.WorkflowId || null,
        workflow_name: raw.WorkflowName || '',
        workflow_group_name: raw.WorkflowGroupName || '',
        service_tag: raw.ServiceTag || '',

        // Languages
        source_language: raw.SourceLanguageCode || '',
        target_language: raw.TargetLanguageCode || '',

        // Quantities
        word_count: wordCount,

        // Financial summary (back-compat fields kept)
        price: totalMaxUsd,
        price_min_usd: totalMinUsd,
        price_max_usd: totalMaxUsd,
        price_confirmed_usd: totalConfirmedUsd,

        // Dates
        due_date: raw.DueDate || null,
        start_date: raw.StartDate || null,
        created_at: raw.CreatedAt || null,
        updated_at: raw.UpdatedAt || null,
        order_date: raw.OrderDate || null,
        accepted_date: raw.AcceptedDate || null,
        approve_date: raw.ApproveDate || null,
        completed_date: raw.CompletedDate || null,

        // Status / type
        state: raw.State,
        task_type: raw.Type || '',
        position: raw.Position || null,
        is_archived: raw.IsArchived || false,
        lock_state: raw.LockState || null,

        // People
        requestors,
        assignees,

        // Metadata
        tags: raw.Tags || [],
        custom_fields: customFields,

        // Finance
        finance_rows: financeRows,
        finance_summary: {
          total_rows: financeRows.length,
          word_row: wordRow || null,
          total_min_usd: totalMinUsd,
          total_max_usd: totalMaxUsd,
          total_confirmed_usd: totalConfirmedUsd,
          billing_units: [...new Set(financeRows.map(r => r.billing_unit))],
          billable_rows: billableCount,
          proposal_rows: proposalCount,
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