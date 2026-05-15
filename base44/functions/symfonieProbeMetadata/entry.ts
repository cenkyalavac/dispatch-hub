// Symfonie $metadata XML'inden Job, Analysis ve Task entity'lerinin tüm property
// listesini çıkarır. Aynı zamanda /Jobs ve /Analyses gibi koleksiyon endpoint'lerini
// liste fazında dener (error body'leri 200 chars kırpılmış halde gösterir).
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

async function getText(url, token) {
  const r = await fetch(url, { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/xml, application/json' } });
  return { status: r.status, ok: r.ok, text: await r.text() };
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function extractEntities(xml) {
  // Parse EntityType blocks and their properties from EDMX XML.
  const entities = {};
  const blocks = xml.matchAll(/<EntityType\s+Name="([^"]+)"[\s\S]*?<\/EntityType>/g);
  for (const m of blocks) {
    const name = m[1];
    const props = [...m[0].matchAll(/<Property\s+Name="([^"]+)"\s+Type="([^"]+)"/g)].map(p => `${p[1]}: ${p[2]}`);
    const navs  = [...m[0].matchAll(/<NavigationProperty\s+Name="([^"]+)"\s+Type="([^"]+)"/g)].map(p => `${p[1]}: ${p[2]}`);
    entities[name] = { properties: props, navigation: navs };
  }
  // Also list all entity-set names (collections you can hit directly)
  const sets = [...xml.matchAll(/<EntitySet\s+Name="([^"]+)"\s+EntityType="([^"]+)"/g)].map(s => ({ name: s[1], type: s[2] }));
  return { entities, sets };
}

Deno.serve(async (req) => {
  try {
    const token = await getToken();

    // 1) Pull the EDMX metadata document — single source of truth for what the
    //    API exposes (entities, properties, navigation, collections).
    const meta = await getText(`${BASE_URL}/$metadata`, token);
    const parsed = meta.ok ? extractEntities(meta.text) : { entities: {}, sets: [] };

    // 2) Filter to entities likely related to CAT/leverage/analysis
    const wanted = ['Task', 'Job', 'Analysis', 'CatAnalysis', 'WeightedAnalysis', 'FuzzyMatch', 'Match', 'Volume', 'Statistic', 'Leverage', 'WordCount', 'TmAnalysis', 'TmLeverage'];
    const filtered_entities = {};
    for (const k of Object.keys(parsed.entities)) {
      if (wanted.some(w => k.toLowerCase().includes(w.toLowerCase()))) filtered_entities[k] = parsed.entities[k];
    }

    // 3) Filter entity sets (collection-level routes) by the same keywords
    const filtered_sets = parsed.sets.filter(s =>
      wanted.some(w => s.name.toLowerCase().includes(w.toLowerCase()) || s.type.toLowerCase().includes(w.toLowerCase()))
    );

    // Pull explicit entities we care about for Belazy-parity:
    const targets = [
      'WordCountAnalyseViewModel', 'WordCountViewModel',
      'TaskViewModel', 'JobViewModel', 'ProjectViewModel',
      'FinanceRowViewModel', 'PurchaseOrderViewModel', 'SalesOrderViewModel',
      'PriceViewModel',
    ];
    const explicit = {};
    for (const t of targets) explicit[t] = parsed.entities[t] || null;

    // Try to extract ParserType enum members from the raw XML
    const parserEnumMatch = meta.text.match(/<EnumType\s+Name="ParserType"[\s\S]*?<\/EnumType>/);
    const parser_enum_members = parserEnumMatch
      ? [...parserEnumMatch[0].matchAll(/<Member\s+Name="([^"]+)"(?:\s+Value="([^"]+)")?/g)].map(m => ({ name: m[1], value: m[2] || null }))
      : null;

    return Response.json({
      all_entity_set_names: parsed.sets.map(s => s.name).sort(),
      explicit_entities: explicit,
      parser_enum_members,
      // collection routes for the analysis-related sets
      analysis_related_sets: parsed.sets.filter(s => /Analys|WordCount|Price/i.test(s.name)),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});