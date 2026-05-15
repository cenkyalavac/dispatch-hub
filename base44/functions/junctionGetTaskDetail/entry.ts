// Junction task detail — notes + assets for a single task.
// Doc: https://welocalizetalent.zendesk.com/hc/en-us/articles/16318106210199
//   GET /v1/task/[taskId]?$include=assets,notes,offers,assignedUser
//   GET /v1/asset/[assetId]/refresh-urls  → presigned S3 URL (only fetched on demand)
//
// We fetch ONLY the task detail here (cheap, single call). Asset download URLs
// are deferred to a separate `?asset_id=...` call so the panel opens instantly
// and we don't burn the 500 req/min budget refreshing URLs the user may not click.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const PROD_BASE = 'https://hypnos.welocalize.tools';

function jHeaders() {
  const jwt = Deno.env.get('JUNCTION_JWT');
  const apiKey = Deno.env.get('JUNCTION_API_KEY');
  if (!jwt) return null;
  const h = { 'x-pantheon-auth': jwt, Accept: 'application/json' };
  if (apiKey) h['x-api-key'] = apiKey;
  return h;
}

// Normalize note rows — pick the human-readable fields and drop deletedAt rows.
function normNote(n) {
  return {
    id: n.id,
    value: n.value || '',
    type: n.taskNote?.type || n.type || 'note',
    acknowledged: n.taskNote?.acknowledged ?? null,
  };
}

// Normalize asset rows. We deliberately do NOT call refresh-urls here — that's
// done lazily when the user clicks the download link.
function normAsset(a) {
  return {
    id: a.id,
    name: a.name || '',
    description: a.description || '',
    locale: a.localeTag || '',
    kind: a.taskAsset?.type || 'work',
    is_qc_form: !!a.meta?.proofReadingForm,
    size: a.size ?? null,
    content_type_id: a.contentTypeId ?? null,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    await base44.auth.me().catch(() => null); // soft auth, same pattern as junctionGetOffers

    const url = new URL(req.url);
    let body = {};
    try { body = await req.json(); } catch { body = {}; }
    const taskId = body.task_id ?? url.searchParams.get('task_id');
    const assetId = body.asset_id ?? url.searchParams.get('asset_id');

    const headers = jHeaders();
    if (!headers) return Response.json({ success: false, error: 'JUNCTION_JWT not configured' }, { status: 503 });

    // Asset download mode — return the refreshed presigned URL.
    if (assetId) {
      const r = await fetch(`${PROD_BASE}/v1/asset/${encodeURIComponent(assetId)}/refresh-urls`, { headers });
      const text = await r.text();
      let data;
      try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 300) }; }
      if (!r.ok) {
        return Response.json({ success: false, error: `Junction asset HTTP ${r.status}`, detail: data }, { status: r.status });
      }
      // Junction returns a few URL flavors — give the UI the one most likely usable.
      const download = data?.downloadUrl || data?.url || data?.signedUrl || data?.urls?.[0] || null;
      return Response.json({ success: true, asset_id: assetId, download_url: download, raw: data });
    }

    // Task detail mode.
    if (!taskId) {
      return Response.json({ success: false, error: 'task_id is required' }, { status: 400 });
    }
    const q = new URLSearchParams({ '$include': 'assets,notes,offers,assignedUser' });
    const r = await fetch(`${PROD_BASE}/v1/task/${encodeURIComponent(taskId)}?${q}`, { headers });
    const text = await r.text();
    let raw;
    try { raw = JSON.parse(text); } catch { raw = { raw: text.slice(0, 300) }; }
    if (!r.ok) {
      return Response.json({
        success: false,
        error: `Junction task HTTP ${r.status}: ${typeof raw === 'string' ? raw : (raw?.message || text.slice(0, 200))}`,
      }, { status: r.status });
    }

    const t = raw?.data || raw;
    const notesArr = Array.isArray(t?.notes) ? t.notes : [];
    const assetsArr = Array.isArray(t?.assets) ? t.assets : [];

    return Response.json({
      success: true,
      task_id: taskId,
      name: t?.name || '',
      description: t?.description || '',
      assigned_user: t?.assignedUser?.name || t?.assignedUser?.email || '',
      notes: notesArr.filter((n) => !n?.deletedAt).map(normNote),
      assets: assetsArr.filter((a) => !a?.deletedAt).map(normAsset),
    });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});