// base44/functions/wsProjectNew/entry.ts
// Broker-callable. The external worldserver-broker calls this when it discovers a
// new WorldServer project: upserts a WsProject (by pgId) with scoping + source link.
// Auth: shared secret header X-Broker-Key must match BROKER_KEY env var.
// The broker owns every field except assignedPm / internalNote (UI-only) — never touch those.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    const expected = Deno.env.get('BROKER_KEY');
    const got = req.headers.get('x-broker-key');
    if (!expected || !got || got !== expected) {
      return Response.json({ error: 'invalid broker key' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const {
      pgId, pgName, vendor, locale, translationRequestId,
      totalWords, sourceDropboxUrl, scopingRaw, dueDate, creationDate,
    } = body || {};
    if (!pgId || !vendor) {
      return Response.json({ error: 'pgId and vendor required' }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);
    const existing = await base44.asServiceRole.entities.WsProject.filter({ pgId });

    if (existing && existing.length > 0) {
      // Already recorded — only improve scoping; never clobber delivery status or UI-only fields.
      const cur = existing[0];
      const patch = {};
      if (typeof totalWords === 'number' && totalWords > (cur.totalWords || 0)) {
        patch.totalWords = totalWords;
        if (scopingRaw && typeof scopingRaw === 'object') patch.scopingRaw = scopingRaw;
      }
      if (Object.keys(patch).length) {
        await base44.asServiceRole.entities.WsProject.update(cur.id, patch);
      }
      return Response.json({ ok: true, action: 'skipped', id: cur.id });
    }

    const created = await base44.asServiceRole.entities.WsProject.create({
      pgId,
      pgName: pgName || '',
      vendor,
      locale: locale || '',
      translationRequestId: translationRequestId || '',
      totalWords: typeof totalWords === 'number' ? totalWords : 0,
      sourceDropboxUrl: sourceDropboxUrl || '',
      translatedDropboxUrl: '',
      dueDate: dueDate || '',
      creationDate: creationDate || '',
      deliveredAt: '',
      status: 'new',
      scopingRaw: scopingRaw && typeof scopingRaw === 'object' ? scopingRaw : {},
    });

    console.log(`[wsProjectNew] created pgId=${pgId} vendor=${vendor} words=${totalWords || 0}`);
    return Response.json({ ok: true, action: 'created', id: created.id });
  } catch (error) {
    console.error('[wsProjectNew] error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
