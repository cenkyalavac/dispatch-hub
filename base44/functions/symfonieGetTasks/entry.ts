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
    // Tasks endpoint:
    //   - Project, Assignees, Requestors, Tags, JobName all arrive inline (no $expand needed)
    //   - Project is NOT a real navigation property — it rejects $expand explicitly, but the data is there anyway
    //   - FinanceRows must be explicitly expanded
    const url = `${BASE_URL}/Tasks?$filter=State eq 'Order'&$expand=FinanceRows&$orderby=CreatedAt desc&$top=200`;
    const tasks = await fetchAllPages(url, token);

    // Each task carries inline { Project: { Id, Name, Code, ProjectState } } — but no Customer.
    // Fetch Customers via /Projects?$filter=Id eq X (Customer is inline on Projects).
    const projectIds = [...new Set(tasks.map(t => t.Project?.Id).filter(Boolean))];
    const projectDetailMap = new Map(); // projectId -> full Project incl. Customer + ProjectManagerId

    if (projectIds.length > 0) {
      // Parallelize batches of 20 — Symfonie tolerates ~5 concurrent requests well.
      const chunks = [];
      for (let i = 0; i < projectIds.length; i += 20) chunks.push(projectIds.slice(i, i + 20));
      const batches = await Promise.all(chunks.map(async (chunk) => {
        const filter = chunk.map(id => `Id eq ${id}`).join(' or ');
        return fetchAllPages(
          `${BASE_URL}/Projects?$filter=${encodeURIComponent(filter)}&$top=${chunk.length}`,
          token
        );
      }));
      batches.flat().forEach(p => projectDetailMap.set(p.Id, p));
      console.log(`Projects resolved: ${projectDetailMap.size}/${projectIds.length}`);
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

      // Single pass over finance rows for all aggregates (was 5 separate iterations).
      let totalMaxUsd = 0, totalMinUsd = 0, totalConfirmedUsd = 0;
      let billableCount = 0, proposalCount = 0;
      let wordRow = null;
      for (const r of financeRows) {
        totalMaxUsd += r.max_usd || 0;
        totalMinUsd += r.min_usd || 0;
        if (r.is_confirmed) totalConfirmedUsd += r.total_usd || 0;
        if (r.purchase_order?.is_billable) billableCount++;
        if (r.purchase_order?.is_proposal) proposalCount++;
        if (!wordRow && (r.billing_unit === 'Words' || r.billing_unit === 'Word')) wordRow = r;
      }
      const wordCount = wordRow?.quantity || 0;

      // Project comes inline on each Task; Customer comes from the Projects pre-fetch.
      const inlineProject = raw.Project || null;
      const projectDetail = inlineProject ? projectDetailMap.get(inlineProject.Id) : null;
      const project = projectDetail || inlineProject;
      const customer = projectDetail?.Customer || null;

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
        project_id: project?.Id ?? null,
        project_name: project?.Name || '',
        project_code: project?.Code || '',
        project_state: project?.ProjectState || null,
        project_manager_id: project?.ProjectManagerId || null,
        account_name: customer?.Name || '',       // Symfonie "Customer" = account
        account_code: customer?.Code || '',
        account_id: customer?.Id || null,

        // Job / workflow — Job is the "division" tier between Project and Task
        job_id: raw.JobId || null,
        job_name: raw.JobName || '',
        job_external_id: '',
        job_identifier: '',
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