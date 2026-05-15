// Symfonie task attachments — list + per-file download for the UI.
//
// Two modes (both POST):
//   { task_id }                    → list attachments for a task
//   { task_id, attachment_id }     → stream the file back as a downloadable response
//
// We deliberately stream raw bytes (not base64-in-JSON) so multi-MB handoff
// files don't blow the Deno response budget. The frontend fetches this endpoint
// directly with the user's auth cookie and triggers a browser download.
//
// Symfonie attachment URLs require a Bearer token, so they can't be linked to
// directly from the browser — this function is the proxy.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const TENANT_ID = Deno.env.get('SYMFONIE_TENANT_ID') || 'ead220ab-1743-4c57-83ae-e055f3401f19';
const SCOPE = 'api://c2e8870d-faef-45ea-919c-b603f97bd0cc/.default';
const BASE_URL = 'https://projects.moravia.com/Api/V5';
const SYMFONIE_HOST = 'https://projects.moravia.com/Api';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getSymfonieToken() {
  const clientId = Deno.env.get('SYMFONIE_CLIENT_ID');
  const clientSecret = Deno.env.get('SYMFONIE_CLIENT_SECRET');
  if (!clientId || !clientSecret) throw new Error('SYMFONIE_CLIENT_ID or SYMFONIE_CLIENT_SECRET missing');
  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');
  params.append('client_id', clientId);
  params.append('client_secret', clientSecret);
  params.append('scope', SCOPE);
  const r = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const data = await r.json();
  if (!data.access_token) throw new Error('Symfonie auth failed: ' + JSON.stringify(data));
  return data.access_token;
}

// Same backoff policy as symfonieDownloadAttachments — Symfonie 503s under load.
async function symfonieFetch(url, token, init = {}, maxRetries = 4) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const r = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(init.headers || {}) },
    });
    if (!r.ok && [429, 502, 503, 504].includes(r.status) && attempt < maxRetries) {
      await sleep(Math.min(1000 * 2 ** attempt, 8000));
      continue;
    }
    return r;
  }
}

Deno.serve(async (req) => {
  try {
    // Admin gate: this endpoint proxies raw task attachments (PII/IP).
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (user !== null && user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    let body = {};
    try { body = await req.json(); } catch { body = {}; }
    const taskId = body.task_id;
    const attachmentId = body.attachment_id;

    if (!taskId) {
      return Response.json({ success: false, error: 'task_id required' }, { status: 400 });
    }

    const token = await getSymfonieToken();

    // List mode — return normalized attachment metadata.
    if (!attachmentId) {
      const r = await symfonieFetch(
        `${BASE_URL}/TaskAttachments?$filter=TaskId eq ${encodeURIComponent(taskId)}`,
        token
      );
      if (!r.ok) {
        const text = await r.text();
        return Response.json(
          { success: false, error: `Symfonie HTTP ${r.status}: ${text.slice(0, 200)}` },
          { status: r.status }
        );
      }
      const data = await r.json();
      // FileType enum (doc: /Api/help/V5/enum/FileType):
      //   0=Other, 1=Reference, 2=Source, 3=Target (delivery), 4=Analysis
      // The TaskAttachment payload exposes this as `FileType` (integer).
      const FILE_TYPE_NAMES = { 0: 'other', 1: 'reference', 2: 'source', 3: 'target', 4: 'analysis' };
      const attachments = (data.value || []).map((a) => ({
        id: a.Id,
        name: a.Name || '',
        size: a.Size ?? null,
        uploaded_at: a.CreatedAt || null,
        uploaded_by: a.CreatedByLogin || a.CreatedBy || '',
        // Documented field is `FileType` (Int32 enum). Map to a human label and
        // expose the raw code for callers that want to filter.
        kind: FILE_TYPE_NAMES[a.FileType] ?? null,
        file_type_code: a.FileType ?? null,
        mime_type: a.MimeType || '',
        relative_path: a.RelativeFilePath || '',
      }));
      return Response.json({ success: true, task_id: taskId, attachments });
    }

    // Download mode — first look up the single attachment to get DownloadUrl + Name.
    // Symfonie has no /TaskAttachments(id) singleton resource; filtering by Id is the documented way.
    const lookupRes = await symfonieFetch(
      `${BASE_URL}/TaskAttachments?$filter=TaskId eq ${encodeURIComponent(taskId)} and Id eq ${encodeURIComponent(attachmentId)}`,
      token
    );
    if (!lookupRes.ok) {
      const text = await lookupRes.text();
      return Response.json(
        { success: false, error: `Symfonie HTTP ${lookupRes.status}: ${text.slice(0, 200)}` },
        { status: lookupRes.status }
      );
    }
    const lookup = await lookupRes.json();
    const att = (lookup.value || [])[0];
    if (!att) return Response.json({ success: false, error: 'Attachment not found' }, { status: 404 });

    const dlUrl = `${SYMFONIE_HOST}/${att.DownloadUrl}`;
    const fileRes = await fetch(dlUrl, {
      headers: { Authorization: `Bearer ${token}`, Accept: '*/*' },
    });
    if (!fileRes.ok) {
      const text = await fileRes.text();
      return Response.json(
        { success: false, error: `Download failed ${fileRes.status}: ${text.slice(0, 200)}` },
        { status: 502 }
      );
    }

    // Stream the body straight back to the browser with a download disposition.
    // RFC 5987 encoding handles non-ASCII filenames (Symfonie file names are often localized).
    const safeName = (att.Name || `attachment_${attachmentId}`).replace(/[\r\n"]/g, '_');
    const encoded = encodeURIComponent(safeName);
    return new Response(fileRes.body, {
      status: 200,
      headers: {
        'Content-Type': fileRes.headers.get('content-type') || 'application/octet-stream',
        'Content-Length': fileRes.headers.get('content-length') || '',
        'Content-Disposition': `attachment; filename="${safeName}"; filename*=UTF-8''${encoded}`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});