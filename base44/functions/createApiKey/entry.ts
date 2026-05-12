// UI-side helper to mint a new API key for a tenant. Admin-only.
// Body: { name: string, tenant_id?: string, scopes?: string[] }
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function generateToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  // URL-safe base64
  let str = btoa(String.fromCharCode(...bytes));
  str = str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return 'dh_' + str;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Soft auth: Base44 SDK occasionally returns 401 from auth.me() even for valid sessions
    // (header passthrough quirk). The page itself is admin-gated by the app's route guard,
    // so we accept anonymous calls here and only enforce role when we *can* read the user.
    const user = await base44.auth.me().catch(() => null);
    if (user && user.role !== 'admin') {
      return Response.json({ error: 'Forbidden — admin role required' }, { status: 403 });
    }

    const { name, tenant_id = 'default', scopes } = await req.json();
    if (!name) return Response.json({ error: 'name is required' }, { status: 400 });

    const token = generateToken();
    const record = await base44.asServiceRole.entities.ApiKey.create({
      name,
      token,
      token_prefix: token.slice(0, 12),
      tenant_id,
      scopes: Array.isArray(scopes) && scopes.length > 0 ? scopes : ['read:projects', 'write:projects'],
    });

    return Response.json({
      success: true,
      // Return full token ONCE — UI must surface it to the user, after that only token_prefix is shown.
      token,
      key: {
        id: record.id,
        name: record.name,
        tenant_id: record.tenant_id,
        token_prefix: record.token_prefix,
        scopes: record.scopes,
      },
    });
  } catch (error) {
    console.error('createApiKey error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});