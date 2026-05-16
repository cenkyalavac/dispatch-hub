// Lists Dropbox folder contents (folders + files) under a given path using the
// shared Dropbox connector. Used by the in-app folder picker on Settings and
// per-portal Dropbox path editors.
//
// Input  : { path?: string }   // "" = root, otherwise must start with "/"
// Output : { path, entries: [{ name, path_lower, type: 'folder'|'file' }] }
//
// Auth: any signed-in user. We never expose the access token to the client;
// we only proxy a constrained list_folder call against the shared account.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const DBX_LIST = 'https://api.dropboxapi.com/2/files/list_folder';
const DBX_LIST_CONTINUE = 'https://api.dropboxapi.com/2/files/list_folder/continue';

const normalizePath = (raw) => {
  if (!raw || raw === '/' || raw === '') return '';
  let p = String(raw).trim();
  if (!p.startsWith('/')) p = '/' + p;
  // Strip trailing slash unless it's the root.
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return p;
};

const dbxFetch = async (url, accessToken, body) => {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* keep text */ }
  if (!res.ok) {
    const summary = json?.error_summary || json?.error?.['.tag'] || text || `HTTP ${res.status}`;
    const err = new Error(`Dropbox: ${summary}`);
    err.status = res.status;
    err.detail = json || text;
    throw err;
  }
  return json;
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { path = '' } = await req.json().catch(() => ({}));
    const dbxPath = normalizePath(path);

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('dropbox');
    if (!accessToken) {
      return Response.json({ error: 'Dropbox is not connected' }, { status: 400 });
    }

    // Page through results (Dropbox returns up to 2000 entries per page).
    const entries = [];
    let page = await dbxFetch(DBX_LIST, accessToken, {
      path: dbxPath,
      recursive: false,
      include_non_downloadable_files: true,
      limit: 1000,
    });
    entries.push(...(page.entries || []));
    while (page.has_more) {
      page = await dbxFetch(DBX_LIST_CONTINUE, accessToken, { cursor: page.cursor });
      entries.push(...(page.entries || []));
    }

    const mapped = entries.map((e) => ({
      name: e.name,
      path_lower: e.path_lower,
      path_display: e.path_display,
      type: e['.tag'] === 'folder' ? 'folder' : 'file',
    }));

    // Folders first, then files, both alphabetical (case-insensitive).
    mapped.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });

    return Response.json({
      path: dbxPath || '/',
      entries: mapped,
    });
  } catch (error) {
    const status = error.status || 500;
    return Response.json({ error: error.message || String(error) }, { status });
  }
});