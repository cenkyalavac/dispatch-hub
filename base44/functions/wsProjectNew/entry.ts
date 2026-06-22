// base44/functions/wsProjectNew/entry.ts
// Called by worldserver-broker when a new WS project is discovered.
// Creates or updates a WsProject entity.

import { WsProject } from '../entities/WsProject';

const WS_BROKER_KEY = process.env.WS_BROKER_KEY;

export default async function wsProjectNew(req: Request): Promise<Response> {
  // Auth check
  const key = req.headers.get('x-broker-key');
  if (WS_BROKER_KEY && key !== WS_BROKER_KEY) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const {
    pgId,
    pgName,
    vendor,
    locale,
    translationRequestId,
    totalWords,
    sourceDropboxUrl,
    scopingRaw,
    dueDate,
    creationDate
  } = body;

  if (!pgId || !vendor) {
    return Response.json({ error: 'pgId and vendor required' }, { status: 400 });
  }

  // Upsert — if project already exists (e.g. re-processed), don't overwrite delivery status
  const existing = await WsProject.filter({ pgId }).getFirst().catch(() => null);

  if (existing) {
    // Already recorded — update scoping if it improved
    if (totalWords && totalWords > (existing.totalWords || 0)) {
      await existing.update({ totalWords, scopingRaw });
    }
    return Response.json({ ok: true, action: 'skipped', id: existing.id });
  }

  const project = await WsProject.create({
    pgId,
    pgName,
    vendor,
    locale,
    translationRequestId,
    totalWords: totalWords || 0,
    sourceDropboxUrl: sourceDropboxUrl || null,
    translatedDropboxUrl: null,
    dueDate: dueDate || null,
    creationDate: creationDate || null,
    deliveredAt: null,
    status: 'new',
    scopingRaw: scopingRaw || null
  });

  return Response.json({ ok: true, action: 'created', id: project.id });
}
