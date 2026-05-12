// Symfonie API keşif aracı.
// Amaç: Completed (eski) task'lardan örnek çek + tüm property'leri raw olarak göster,
// böylece CAT analiz alanları (fuzzy matches, weighted quantity vb.) var mı görelim.
const TENANT_ID = Deno.env.get('SYMFONIE_TENANT_ID');
const SCOPE = 'api://c2e8870d-faef-45ea-919c-b603f97bd0cc/.default';
const BASE_URL = 'https://projects.moravia.com/Api/V5';

async function getToken() {
  const clientId = Deno.env.get('SYMFONIE_CLIENT_ID');
  const clientSecret = Deno.env.get('SYMFONIE_CLIENT_SECRET');
  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');
  params.append('client_id', clientId);
  params.append('client_secret', clientSecret);
  params.append('scope', SCOPE);
  const r = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });
  if (!r.ok) throw new Error('Token: ' + await r.text());
  return (await r.json()).access_token;
}

async function tryUrl(url, token) {
  const r = await fetch(url, { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' } });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* leave null */ }
  return { url, status: r.status, ok: r.ok, body: json || text.slice(0, 500) };
}

Deno.serve(async (req) => {
  try {
    const token = await getToken();
    const { state = 'Accepted', includeRaw = true } = await req.json().catch(() => ({}));

    // 1) Tasks endpoint — distinct State values to see what's available
    //    State filter: try multiple states
    const states = ['Order', 'Accepted', 'Active', 'InProgress', 'Completed', 'Delivered', 'Closed', 'Approved'];
    const stateProbes = await Promise.all(states.map(async (s) => {
      const r = await tryUrl(
        `${BASE_URL}/Tasks?$filter=State eq '${s}'&$top=1&$count=true`,
        token
      );
      return { state: s, status: r.status, count: r.body?.['@odata.count'] ?? null, sampleId: r.body?.value?.[0]?.Id ?? null };
    }));

    // 2) Fetch one task in the requested state with ALL possible expands
    //    Try different combinations to see what CAT-related fields exist
    const expandCombos = [
      'FinanceRows',
      'FinanceRows,FinanceRows/Analysis',
      'FinanceRows,Analysis',
      'Analysis',
      'WeightedAnalysis',
      'CatAnalysis',
      'FuzzyMatches',
    ];

    const expandProbes = await Promise.all(expandCombos.map(async (expand) => {
      const url = `${BASE_URL}/Tasks?$filter=State eq '${state}'&$expand=${encodeURIComponent(expand)}&$top=1`;
      const r = await tryUrl(url, token);
      return { expand, status: r.status, error: !r.ok ? (typeof r.body === 'string' ? r.body.slice(0, 200) : r.body) : null };
    }));

    // 3) Get one full task in the requested state with whatever works, show ALL keys
    const taskRes = await tryUrl(
      `${BASE_URL}/Tasks?$filter=State eq '${state}'&$expand=FinanceRows&$orderby=CreatedAt desc&$top=1`,
      token
    );
    const sampleTask = taskRes.body?.value?.[0] || null;

    // 4) Try the OData metadata endpoint to see schema (only top-level Tasks entity)
    const metaProbe = await tryUrl(`${BASE_URL}/$metadata`, token);
    let availableProperties = null;
    if (typeof metaProbe.body === 'string') {
      // Extract Task entity properties from XML metadata
      const taskMatch = metaProbe.body.match(/<EntityType Name="Task"[\s\S]*?<\/EntityType>/);
      if (taskMatch) {
        const props = [...taskMatch[0].matchAll(/<(?:Property|NavigationProperty) Name="([^"]+)"[^/]*Type="([^"]+)"/g)];
        availableProperties = props.map(m => ({ name: m[1], type: m[2] }));
      }
    }

    // 5) Try Job entity (CAT analysis might live on the Job level, not Task)
    const jobProbe = sampleTask?.JobId
      ? await tryUrl(`${BASE_URL}/Jobs(${sampleTask.JobId})?$expand=Analysis,WeightedAnalysis,FuzzyMatches`, token)
      : null;

    // 6) Try Project-level analysis
    const projectProbe = sampleTask?.Project?.Id
      ? await tryUrl(`${BASE_URL}/Projects(${sampleTask.Project.Id})?$expand=Analysis`, token)
      : null;

    return Response.json({
      state_counts: stateProbes,
      expand_probes: expandProbes,
      sample_task_keys: sampleTask ? Object.keys(sampleTask) : null,
      sample_finance_row_keys: sampleTask?.FinanceRows?.[0] ? Object.keys(sampleTask.FinanceRows[0]) : null,
      sample_task_raw: includeRaw ? sampleTask : null,
      task_entity_schema: availableProperties,
      job_probe: jobProbe ? { status: jobProbe.status, keys: jobProbe.body && typeof jobProbe.body === 'object' ? Object.keys(jobProbe.body) : null, error: !jobProbe.ok ? jobProbe.body : null } : null,
      project_probe: projectProbe ? { status: projectProbe.status, keys: projectProbe.body && typeof projectProbe.body === 'object' ? Object.keys(projectProbe.body) : null, error: !projectProbe.ok ? projectProbe.body : null } : null,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});