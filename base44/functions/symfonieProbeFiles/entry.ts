// Tek seferlik kesif: Symfonie'de bir Order-state task icin file endpoint'lerini test et.
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

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function get(url, token, maxRetries = 4) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const r = await fetch(url, { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' } });
    const text = await r.text();
    if (!r.ok && [429, 502, 503, 504].includes(r.status) && attempt < maxRetries) {
      await sleep(Math.min(1000 * 2 ** attempt, 8000));
      continue;
    }
    let json = null; try { json = JSON.parse(text); } catch {}
    return { status: r.status, ok: r.ok, body: json || text.slice(0, 400) };
  }
}

Deno.serve(async (req) => {
  try {
    const token = await getToken();
    const { task_id } = await req.json().catch(() => ({}));

    // Eger task_id verilmediyse ilk Order task'i al
    let taskId = task_id;
    let jobId = null;
    if (!taskId) {
      const r = await get(`${BASE_URL}/Tasks?$filter=State eq 'Order'&$top=1`, token);
      const t = r.body?.value?.[0];
      if (!t) return Response.json({ error: 'No Order task found' });
      taskId = t.Id;
      jobId = t.JobId;
    }

    // Denenecek file endpoint'leri
    const probes = [
      `${BASE_URL}/Tasks(${taskId})/Files`,
      `${BASE_URL}/Tasks(${taskId})/TaskFiles`,
      `${BASE_URL}/Tasks(${taskId})/SourceFiles`,
      `${BASE_URL}/Files?$filter=TaskId eq ${taskId}`,
      `${BASE_URL}/TaskFiles?$filter=TaskId eq ${taskId}`,
    ];
    if (jobId) {
      probes.push(`${BASE_URL}/Jobs(${jobId})/Files`);
      probes.push(`${BASE_URL}/Files?$filter=JobId eq ${jobId}`);
    }

    const results = {};
    for (const url of probes) {
      const r = await get(url, token);
      results[url.replace(BASE_URL, '')] = {
        status: r.status,
        ok: r.ok,
        sample: r.ok ? (r.body?.value ? { count: r.body.value.length, first_keys: r.body.value[0] ? Object.keys(r.body.value[0]) : null, first: r.body.value[0] } : r.body) : (typeof r.body === 'string' ? r.body : null),
      };
      await sleep(400);
    }

    return Response.json({ task_id: taskId, job_id: jobId, probes: results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});