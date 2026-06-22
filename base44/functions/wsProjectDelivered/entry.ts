// base44/functions/wsProjectDelivered/entry.ts
// Broker-callable. The external worldserver-broker calls this when a translator delivers
// (TranslationRequest moved past the Translate step): marks the WsProject delivered and
// stores the translated WSXZ Dropbox link.
// Auth: shared secret header X-Broker-Key must match BROKER_KEY env var.

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
    const { pgId, vendor, locale, translationRequestId, translatedDropboxUrl, deliveredAt } = body || {};
    if (!pgId) {
      return Response.json({ error: 'pgId required' }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);
    const existing = await base44.asServiceRole.entities.WsProject.filter({ pgId });
    const now = deliveredAt || new Date().toISOString();

    if (existing && existing.length > 0) {
      await base44.asServiceRole.entities.WsProject.update(existing[0].id, {
        translatedDropboxUrl: translatedDropboxUrl || '',
        deliveredAt: now,
        status: 'delivered',
      });
      console.log(`[wsProjectDelivered] updated pgId=${pgId}`);
      return Response.json({ ok: true, action: 'updated', id: existing[0].id });
    }

    // Rare: delivery seen before wsProjectNew ran — create a minimal delivered record.
    const created = await base44.asServiceRole.entities.WsProject.create({
      pgId,
      vendor: vendor || 'unknown',
      locale: locale || '',
      translationRequestId: translationRequestId || '',
      totalWords: 0,
      sourceDropboxUrl: '',
      translatedDropboxUrl: translatedDropboxUrl || '',
      deliveredAt: now,
      status: 'delivered',
      scopingRaw: {},
    });
    console.log(`[wsProjectDelivered] created-on-delivery pgId=${pgId}`);
    return Response.json({ ok: true, action: 'created-on-delivery', id: created.id });
  } catch (error) {
    console.error('[wsProjectDelivered] error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
