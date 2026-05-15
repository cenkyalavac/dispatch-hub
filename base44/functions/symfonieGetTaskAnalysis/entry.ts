// symfonieGetTaskAnalysis — single-purpose helper used by symfonieProcessTasks
// and symfonieAcceptTask. Pulls the most recent WordCountAnalysis attached to
// a Symfonie task and maps Symfonie's parser-native band labels to our
// portal-neutral `lev_*` schema (the same one GlobalLink already populates).
//
// Symfonie wire shape (confirmed live):
//   GET /Api/V5/WordCountAnalyses?$filter=TaskId eq {id}
//   → [{ Id, Name, AttachmentId, CreatedAt, Parser, TaskId,
//        WordCounts: [{ Name, Value, Segments, Characters }, ...] }]
//
// All 50 production analyses in this tenant use Parser="MemSource" — the band
// labels below are the MemSource standard. Other parsers (TradosStudio,
// MemoQ, XTM, etc.) emit different label strings; add their mappings inside
// `BAND_MAP_BY_PARSER` when we see one in the wild.
//
// We intentionally keep this function small — input: one task_id (or many),
// output: a flat `{ lev_*, parser_type }` object per task. The caller is
// responsible for stitching this back onto the AcceptedTask row.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

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
    body: params.toString(),
  });
  if (!r.ok) throw new Error('Symfonie token error: ' + await r.text());
  return (await r.json()).access_token;
}

// Parser-aware label → lev_* mapping. MemSource is the only parser observed in
// production right now; the other entries are placeholders based on each CAT's
// public WC export format. Add/correct them as new parsers actually appear.
const BAND_MAP_BY_PARSER = {
  // Memsource / Phrase TMS — confirmed live
  MemSource: {
    'Context TM (Words)': 'lev_context',
    'Repetitions (Words)': 'lev_rep',
    '100% (Words)': 'lev_match100',
    '95% - 99% (Words)': 'lev_9599',
    '85% - 94% (Words)': 'lev_8594',
    '75% - 84% (Words)': 'lev_7584',
    '50% - 74% (Words)': 'lev_5074',
    'No Match (Words)': 'lev_no_match',
  },
  // Default fallback — also used when Parser is None/unknown. Symfonie tends
  // to normalise labels even across parsers, so the MemSource labels match
  // most exports as-is.
  default: {
    'Context TM (Words)': 'lev_context',
    'Context Match': 'lev_context',
    'Context TM': 'lev_context',
    'Repetitions (Words)': 'lev_rep',
    'Repetitions': 'lev_rep',
    '100% (Words)': 'lev_match100',
    '100%': 'lev_match100',
    '95% - 99% (Words)': 'lev_9599',
    '95%-99%': 'lev_9599',
    '85% - 94% (Words)': 'lev_8594',
    '85%-94%': 'lev_8594',
    '75% - 84% (Words)': 'lev_7584',
    '75%-84%': 'lev_7584',
    '50% - 74% (Words)': 'lev_5074',
    '50%-74%': 'lev_5074',
    'No Match (Words)': 'lev_no_match',
    'No Match': 'lev_no_match',
  },
};

function emptyBands() {
  return {
    lev_context: 0,
    lev_rep: 0,
    lev_match100: 0,
    lev_9599: 0,
    lev_8594: 0,
    lev_7584: 0,
    lev_5074: 0,
    lev_no_match: 0,
  };
}

function mapAnalysisToBands(analysis) {
  const bands = emptyBands();
  if (!analysis || !Array.isArray(analysis.WordCounts)) {
    return { bands, parser_type: '', analysis_word_count: 0 };
  }
  const parser = analysis.Parser || 'default';
  const map = BAND_MAP_BY_PARSER[parser] || BAND_MAP_BY_PARSER.default;

  let totalFromAnalysis = 0;
  for (const w of analysis.WordCounts) {
    const key = map[w.Name];
    if (key) bands[key] = Number(w.Value) || 0;
    if (w.Name === 'Total (Words)' || w.Name === 'Total') {
      totalFromAnalysis = Number(w.Value) || 0;
    }
  }
  return { bands, parser_type: parser, analysis_word_count: totalFromAnalysis };
}

async function fetchAnalysisForTask(taskId, token) {
  // Newest analysis wins — Symfonie keeps every uploaded WC CSV; we only want
  // the latest one.
  const url = `${BASE_URL}/WordCountAnalyses?$filter=TaskId eq ${taskId}&$orderby=CreatedAt desc&$top=1`;
  const r = await fetch(url, { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' } });
  if (!r.ok) return null;
  const body = await r.json().catch(() => ({ value: [] }));
  return body.value?.[0] || null;
}

Deno.serve(async (req) => {
  try {
    // Admin gate — exposes raw analysis data (financial signals).
    // Allow scheduled/system calls (no user context) so processTasks/acceptTask
    // can invoke it via base44.asServiceRole.functions.invoke().
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (user !== null && user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { task_id, task_ids } = body;
    const ids = task_id ? [Number(task_id)] : (Array.isArray(task_ids) ? task_ids.map(Number) : []);
    if (ids.length === 0) {
      return Response.json({ error: 'task_id or task_ids required' }, { status: 400 });
    }

    const token = await getToken();

    const results = {};
    // Run sequentially with tiny gap to be polite to the API — analyses are
    // small payloads but Symfonie throttles aggressive parallel hits.
    for (const id of ids) {
      const a = await fetchAnalysisForTask(id, token);
      if (!a) {
        results[id] = { ...emptyBands(), parser_type: '', analysis_word_count: 0, analysis_found: false };
        continue;
      }
      const mapped = mapAnalysisToBands(a);
      results[id] = {
        ...mapped.bands,
        parser_type: mapped.parser_type,
        analysis_word_count: mapped.analysis_word_count,
        analysis_found: true,
      };
      await new Promise((r) => setTimeout(r, 80));
    }

    // Return shape depends on how it was called.
    if (task_id) return Response.json(results[Number(task_id)]);
    return Response.json({ results });
  } catch (error) {
    console.error('symfonieGetTaskAnalysis error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});