// WordCountAnalyses ve WordCountViewModel için canlı keşif.
// Bir Order task seç, bağlı WordCountAnalyses'i çek, parser tiplerini ve WordCount
// breakdown'unun gerçek alanlarını görelim.
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
  return { status: r.status, ok: r.ok, body: json || text.slice(0, 300) };
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

Deno.serve(async (req) => {
  try {
    const token = await getToken();
    const { task_id } = await req.json().catch(() => ({}));

    // 1) Get sample Order task IDs (limit 5 to find one that HAS WordCountAnalyses)
    let taskIds = [];
    if (task_id) {
      taskIds = [task_id];
    } else {
      const r = await get(`${BASE_URL}/Tasks?$filter=State eq 'Order'&$top=10&$orderby=CreatedAt desc&$select=Id,Name,JobId`, token);
      taskIds = (r.body?.value || []).map(t => t.Id);
    }
    await sleep(300);

    // 2) For each task, query WordCountAnalyses filtered by TaskId
    const results = [];
    for (const tid of taskIds) {
      const r = await get(`${BASE_URL}/WordCountAnalyses?$filter=TaskId eq ${tid}`, token);
      const analyses = r.body?.value || [];
      results.push({
        task_id: tid,
        status: r.status,
        analysis_count: analyses.length,
        analyses_summary: analyses.map(a => ({
          id: a.Id, name: a.Name, parser: a.Parser, created_at: a.CreatedAt,
          word_counts_len: Array.isArray(a.WordCounts) ? a.WordCounts.length : null,
          word_count_first: Array.isArray(a.WordCounts) ? a.WordCounts[0] : null,
        })),
      });
      // First task with results — also pull all keys of a WordCount item
      if (analyses.length > 0 && Array.isArray(analyses[0].WordCounts) && analyses[0].WordCounts.length > 0) {
        results[results.length - 1].first_word_count_keys = Object.keys(analyses[0].WordCounts[0]);
        results[results.length - 1].first_word_count_full = analyses[0].WordCounts[0];
        results[results.length - 1].first_analysis_full = analyses[0];
        break; // stop scanning, we have what we need
      }
      await sleep(200);
    }

    // 3) Sample 50 analyses across the system to see distinct parser values and
    //    WordCount.Name labels — this confirms what Belazy must handle.
    const wide = await get(`${BASE_URL}/WordCountAnalyses?$top=50&$orderby=CreatedAt desc`, token);
    const analyses = wide.body?.value || [];
    const distinctParsers = [...new Set(analyses.map(a => a.Parser))];
    const distinctBandNames = [...new Set(analyses.flatMap(a => (a.WordCounts || []).map(w => w.Name)))];

    return Response.json({
      wide_analyses_count: analyses.length,
      distinct_parsers: distinctParsers,
      distinct_band_names: distinctBandNames,
      sample_per_parser: distinctParsers.map(p => {
        const a = analyses.find(x => x.Parser === p);
        return { parser: p, sample_word_counts: a?.WordCounts || [] };
      }),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});