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
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });
  return (await r.json()).access_token;
}

async function get(url, token) {
  const r = await fetch(url, { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' } });
  return { status: r.status, body: await r.text() };
}

Deno.serve(async (req) => {
  try {
    const { jobId = 4091590 } = await req.json().catch(() => ({}));
    const token = await getToken();

    const out = {};

    // 1) Direct job by key
    out.directJob = await get(`${BASE_URL}/Jobs(${jobId})`, token);

    // 2) Filter-based
    out.filterJob = await get(`${BASE_URL}/Jobs?$filter=Id eq ${jobId}`, token);

    // 3) Jobs first page (any access at all?)
    out.firstJobs = await get(`${BASE_URL}/Jobs?$top=2`, token);

    // 4) Projects first page
    out.firstProjects = await get(`${BASE_URL}/Projects?$top=2`, token);

    // 5) Single task by key, with Project expand
    out.taskWithProject = await get(`${BASE_URL}/Tasks(41889722)?$expand=Project`, token);

    // 6) All projects (count) — to find ProjectId in our data
    out.projectCount = await get(`${BASE_URL}/Projects/$count`, token);

    // Trim bodies for response
    for (const k of Object.keys(out)) {
      out[k] = { status: out[k].status, body: out[k].body.substring(0, 600) };
    }

    return Response.json(out);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
});