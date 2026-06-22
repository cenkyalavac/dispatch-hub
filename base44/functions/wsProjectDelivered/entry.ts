// base44/functions/wsProjectDelivered/entry.ts
// Called by worldserver-broker when translator delivers (step past Translate).
// Updates WsProject status and stores translated WSXZ Dropbox URL.

import { WsProject } from '../entities/WsProject';

const WS_BROKER_KEY = process.env.WS_BROKER_KEY;

export default async function wsProjectDelivered(req: Request): Promise<Response> {
  const key = req.headers.get('x-broker-key');
  if (WS_BROKER_KEY && key !== WS_BROKER_KEY) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const {
    pgId,
    vendor,
    locale,
    translationRequestId,
    translatedDropboxUrl,
    deliveredAt
  } = body;

  if (!pgId) {
    return Response.json({ error: 'pgId required' }, { status: 400 });
  }

  const existing = await WsProject.filter({ pgId }).getFirst().catch(() => null);

  if (!existing) {
    // Rare: delivered before wsProjectNew ran — create a minimal record
    await WsProject.create({
      pgId,
      vendor: vendor || 'unknown',
      locale: locale || 'unknown',
      translationRequestId: translationRequestId || null,
      totalWords: 0,
      sourceDropboxUrl: null,
      translatedDropboxUrl: translatedDropboxUrl || null,
      deliveredAt: deliveredAt || new Date().toISOString(),
      status: 'delivered',
      scopingRaw: null
    });
    return Response.json({ ok: true, action: 'created-on-delivery' });
  }

  await existing.update({
    translatedDropboxUrl: translatedDropboxUrl || null,
    deliveredAt: deliveredAt || new Date().toISOString(),
    status: 'delivered'
  });

  return Response.json({ ok: true, action: 'updated', id: existing.id });
}
