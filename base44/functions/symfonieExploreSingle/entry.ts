// Tek bir task'ı tam detayıyla çek, tüm key'leri göster.
// Sıralı yapıyoruz — Symfonie hızlı paralel istekleri "no available server" ile reddediyor.
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
  return { status: r.status, ok: r.ok, body: json || text.slice(0, 500) };
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

Deno.serve(async (req) => {
  try {
    const token = await getToken();
    const { state = 'Order' } = await req.json().catch(() => ({}));

    // Step 1: get one task in that state with FinanceRows
    const r1 = await get(
      `${BASE_URL}/Tasks?$filter=State eq '${state}'&$expand=FinanceRows&$orderby=CreatedAt desc&$top=1`,
      token
    );
    const task = r1.body?.value?.[0];
    if (!task) return Response.json({ error: 'No task found', raw: r1 });

    await sleep(400);

    // Step 2: probe nav properties one at a time (sequential, with backoff)
    const navProps = [
      'Job', 'Analysis', 'WeightedAnalysis', 'CatAnalysis', 'FuzzyMatches',
      'Matches', 'Statistics', 'AnalysisRows', 'TaskAnalysis', 'Volumes',
    ];
    const navProbes = {};
    for (const np of navProps) {
      const r = await get(`${BASE_URL}/Tasks?$filter=Id eq ${task.Id}&$expand=${np}&$top=1`, token);
      const t = r.body?.value?.[0];
      navProbes[np] = {
        status: r.status,
        present: r.ok && t && (np in t) && t[np] != null,
        sample: r.ok && t?.[np] ? (Array.isArray(t[np]) ? { type: 'array', len: t[np].length, first_keys: t[np][0] ? Object.keys(t[np][0]) : null } : { type: typeof t[np], keys: typeof t[np] === 'object' ? Object.keys(t[np]) : null }) : null,
      };
      await sleep(300);
    }

    // Step 3: Job-level analysis if JobId present
    let jobAnalysis = null;
    if (task.JobId) {
      const jobNavs = ['Analysis', 'WeightedAnalysis', 'FuzzyMatches', 'Tasks'];
      jobAnalysis = {};
      for (const np of jobNavs) {
        const r = await get(`${BASE_URL}/Jobs?$filter=Id eq ${task.JobId}&$expand=${np}&$top=1`, token);
        const j = r.body?.value?.[0];
        jobAnalysis[np] = {
          status: r.status,
          present: r.ok && j && (np in j) && j[np] != null,
          sample: r.ok && j?.[np] ? (Array.isArray(j[np]) ? { type: 'array', len: j[np].length, first_keys: j[np][0] ? Object.keys(j[np][0]) : null } : { keys: typeof j[np] === 'object' ? Object.keys(j[np]) : null }) : null,
        };
        await sleep(300);
      }
      // Also fetch the bare Job
      const jobBare = await get(`${BASE_URL}/Jobs?$filter=Id eq ${task.JobId}&$top=1`, token);
      jobAnalysis.bare_job_keys = jobBare.body?.value?.[0] ? Object.keys(jobBare.body.value[0]) : null;
      jobAnalysis.bare_job_sample = jobBare.body?.value?.[0] || null;
    }

    return Response.json({
      task_id: task.Id,
      task_state: task.State,
      task_keys: Object.keys(task),
      task_sample: task,
      finance_row_keys: task.FinanceRows?.[0] ? Object.keys(task.FinanceRows[0]) : null,
      finance_row_sample: task.FinanceRows?.[0] || null,
      nav_probes: navProbes,
      job_analysis: jobAnalysis,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});