// Tek bir Order task için Job + FinanceRow detayını tam olarak çıkarır.
// Amaç: CAT/leverage alanlarının nerede yaşadığını kesin tespit etmek.
const TENANT_ID = Deno.env.get('SYMFONIE_TENANT_ID');
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
  return (await r.json()).access_token;
}

async function get(url, token) {
  const r = await fetch(url, { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' } });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* ignore */ }
  return { status: r.status, ok: r.ok, body: json || text.slice(0, 400) };
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

Deno.serve(async (req) => {
  try {
    const token = await getToken();
    const { task_id } = await req.json().catch(() => ({}));

    // Eğer task_id verilmemişse Order state'inden bir tane al
    let taskId = task_id;
    if (!taskId) {
      const r = await get(`${BASE_URL}/Tasks?$filter=State eq 'Order'&$top=1&$orderby=CreatedAt desc`, token);
      taskId = r.body?.value?.[0]?.Id;
      if (!taskId) return Response.json({ error: 'No Order task found' });
    }

    await sleep(300);

    // 1) Task with FinanceRows tam payload
    const r1 = await get(`${BASE_URL}/Tasks(${taskId})?$expand=FinanceRows`, token);
    const task = r1.body;
    await sleep(300);

    // 2) JobId üzerinden Job entity'sinin tüm key'leri ve raw payload'u
    const jobId = task?.JobId;
    let job = null;
    if (jobId) {
      const rj = await get(`${BASE_URL}/Jobs(${jobId})`, token);
      job = rj.body;
      await sleep(300);
    }

    // 3) Job-level expand probes — CAT analiz buradaysa görelim
    const jobExpands = [
      'Analysis', 'WeightedAnalysis', 'CatAnalysis', 'FuzzyMatches',
      'Matches', 'Statistics', 'AnalysisRows', 'Volumes',
      'TmAnalysis', 'TmLeverage', 'Leverage', 'WordCounts',
      'Files', 'Resources', 'CatFiles', 'AnalysisData', 'Quote',
    ];
    const jobProbes = {};
    for (const np of jobExpands) {
      const r = await get(`${BASE_URL}/Jobs(${jobId})?$expand=${np}`, token);
      jobProbes[np] = {
        status: r.status,
        ok: r.ok,
        present: r.ok && r.body && (np in r.body) && r.body[np] != null,
        sample: r.ok && r.body?.[np]
          ? (Array.isArray(r.body[np])
              ? { type: 'array', len: r.body[np].length, first: r.body[np][0] || null }
              : { type: typeof r.body[np], value: r.body[np] })
          : null,
        error: !r.ok ? (typeof r.body === 'string' ? r.body.slice(0, 200) : r.body) : null,
      };
      await sleep(250);
    }

    // 4) Doğrudan endpoint denemeleri (separate resource'lar)
    const directProbes = {};
    const directPaths = [
      `Jobs(${jobId})/Analysis`,
      `Jobs(${jobId})/WeightedAnalysis`,
      `Jobs(${jobId})/CatAnalysis`,
      `Jobs(${jobId})/TmAnalysis`,
      `Tasks(${taskId})/Analysis`,
      `Tasks(${taskId})/WeightedAnalysis`,
      `Analyses?$filter=JobId eq ${jobId}`,
      `CatAnalyses?$filter=JobId eq ${jobId}`,
      `TmAnalyses?$filter=JobId eq ${jobId}`,
    ];
    for (const p of directPaths) {
      const r = await get(`${BASE_URL}/${p}`, token);
      directProbes[p] = {
        status: r.status,
        ok: r.ok,
        body_preview: r.ok ? r.body : (typeof r.body === 'string' ? r.body.slice(0, 200) : r.body),
      };
      await sleep(250);
    }

    // Compress for the response — full payloads truncate at 8KB-ish.
    return Response.json({
      task_id: taskId,
      job_id: jobId,
      finance_row_keys: task?.FinanceRows?.[0] ? Object.keys(task.FinanceRows[0]) : null,
      finance_row_purchase_order_keys: task?.FinanceRows?.[0]?.PurchaseOrder ? Object.keys(task.FinanceRows[0].PurchaseOrder) : null,
      finance_row_purchase_order_prices: task?.FinanceRows?.[0]?.PurchaseOrder?.Prices || null,
      finance_row_sales_order_keys: task?.FinanceRows?.[0]?.SalesOrder ? Object.keys(task.FinanceRows[0].SalesOrder) : null,
      finance_rows_count: task?.FinanceRows?.length || 0,
      finance_rows_billing_units: (task?.FinanceRows || []).map(f => ({ id: f.Id, billing_unit: f.BillingUnit, quantity: f.Quantity })),
      job_keys: job && typeof job === 'object' ? Object.keys(job) : null,
      job_id_value: job?.Id,
      job_name: job?.Name,
      job_expand_probes_summary: Object.fromEntries(
        Object.entries(jobProbes).map(([k, v]) => [k, { status: v.status, ok: v.ok, present: v.present, sample_summary: v.sample ? (v.sample.type === 'array' ? `array(len=${v.sample.len})` : 'object') : null, error: v.error ? String(v.error).slice(0, 120) : null }])
      ),
      direct_endpoint_status: Object.fromEntries(
        Object.entries(directProbes).map(([k, v]) => [k, { status: v.status, ok: v.ok, body_type: typeof v.body_preview }])
      ),
      // Successful probes — full data
      successful_probes: Object.fromEntries(
        Object.entries(jobProbes).filter(([_, v]) => v.ok && v.present).map(([k, v]) => [k, v.sample])
      ),
      successful_direct: Object.fromEntries(
        Object.entries(directProbes).filter(([_, v]) => v.ok).map(([k, v]) => [k, v.body_preview])
      ),
      job_error_bodies: Object.fromEntries(
        Object.entries(jobProbes).filter(([_, v]) => !v.ok).slice(0, 3).map(([k, v]) => [k, v.error])
      ),
      direct_error_bodies: Object.fromEntries(
        Object.entries(directProbes).filter(([_, v]) => !v.ok).slice(0, 5).map(([k, v]) => [k, v.body_preview])
      ),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});