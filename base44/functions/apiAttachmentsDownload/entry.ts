// Generate a short-lived Dropbox download link for one attachment.
// Body: { attachment_id }
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function parseApiKey(req) {
  const h = req.headers.get('authorization') || req.headers.get('Authorization') || '';
  const m = h.match(/^(?:Apikey|Bearer)\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

async function authenticateKey(base44, token, scopeNeeded) {
  if (!token) return { error: 'Missing Authorization header (Apikey <token>)', status: 401 };
  const matches = await base44.asServiceRole.entities.ApiKey.filter({ token });
  const key = matches?.[0];
  if (!key) return { error: 'Invalid API key', status: 401 };
  if (key.revoked_at) return { error: 'API key has been revoked', status: 403 };
  if (scopeNeeded && Array.isArray(key.scopes) && !key.scopes.includes(scopeNeeded)) {
    return { error: `API key missing scope: ${scopeNeeded}`, status: 403 };
  }
  base44.asServiceRole.entities.ApiKey.update(key.id, { last_used_at: new Date().toISOString() }).catch(() => {});
  return { key };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const token = parseApiKey(req);
    const auth = await authenticateKey(base44, token, 'read:projects');
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

    const { attachment_id } = await req.json().catch(() => ({}));
    if (!attachment_id) return Response.json({ error: 'attachment_id is required' }, { status: 400 });

    const att = await base44.asServiceRole.entities.ProjectAttachment.get(attachment_id).catch(() => null);
    if (!att || att.tenant_id !== auth.key.tenant_id) {
      return Response.json({ error: 'Attachment not found' }, { status: 404 });
    }

    if (att.storage !== 'dropbox' || !att.storage_path) {
      return Response.json({ error: 'Attachment storage not downloadable' }, { status: 400 });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('dropbox');
    // Dropbox temporary link — ~4 hours validity, no auth needed by recipient.
    const r = await fetch('https://api.dropboxapi.com/2/files/get_temporary_link', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: att.storage_path }),
    });
    if (!r.ok) {
      const t = await r.text();
      return Response.json({ error: `Dropbox link failed: ${t.slice(0, 300)}` }, { status: 502 });
    }
    const data = await r.json();
    return Response.json({
      attachment_id,
      name: att.name,
      url: data.link,
      expires_in_seconds: 4 * 3600,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});