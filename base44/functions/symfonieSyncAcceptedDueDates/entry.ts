// Periodic poll: detect due_date changes on already-accepted Symfonie tasks.
//
// Scope (intentionally narrow):
//   - portal = 'symfonie'
//   - status = 'accepted'
//   - due_date > now  (only OPEN tasks — past-due/completed are not re-synced)
//   - ONLY the due_date field is reconciled — nothing else.
//
// How it works:
//   1. Pull the open AcceptedTask rows from our DB.
//   2. Batch-fetch their current DueDate from Symfonie via OData `Id in (...)`.
//   3. For each row whose DueDate moved (timestamp compare, ignores reformats),
//      call AcceptedTask.update({ due_date }). The existing entity automation
//      `handleDueDateChange` picks up the change and handles:
//        - in-app UserNotification (bell + Notifications page)
//        - Project.update + project.updated webhook to subscribed BMSes
//        - sheetsUpdateTaskRow (Google Sheets cell rewrite)
//        - admin email (added in handleDueDateChange)
//      → Zero new code paths for Project/Sheets/BMS/notification logic here.
//
// Admin-only: invoked by the scheduled automation worker (no user context)
// or by an admin testing manually. Service-account / system runs allowed.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const TENANT_ID = Deno.env.get('SYMFONIE_TENANT_ID') || 'ead220ab-1743-4c57-83ae-e055f3401f19';
const SCOPE = 'api://c2e8870d-faef-45ea-919c-b603f97bd0cc/.default';
const BASE_URL = 'https://projects.moravia.com/Api/V5';

async function getToken() {
  const clientId = Deno.env.get('SYMFONIE_CLIENT_ID');
  const clientSecret = Deno.env.get('SYMFONIE_CLIENT_SECRET');
  if (!clientId || !clientSecret) throw new Error('SYMFONIE_CLIENT_ID or SYMFONIE_CLIENT_SECRET is missing');

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
  if (!r.ok) throw new Error('Symfonie token failed: ' + await r.text());
  const d = await r.json();
  return d.access_token;
}

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

// Symfonie returns 503/429 under load — retry with exponential backoff so a
// transient blip doesn't fail the whole sync.
async function fetchJsonRetry(url, token, maxRetries = 3) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const r = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
    });
    if (r.ok) return r.json();
    if ([429, 502, 503, 504].includes(r.status) && attempt < maxRetries) {
      await sleep(Math.min(1000 * 2 ** attempt, 8000));
      continue;
    }
    throw new Error(`Symfonie API ${r.status}: ${(await r.text()).slice(0, 200)}`);
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Allow scheduled/system calls (no user context). Reject non-admin users.
    const user = await base44.auth.me().catch(() => null);
    if (user !== null && user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Kill switch: skip if the Symfonie portal is toggled off.
    const portalRows = await base44.asServiceRole.entities.Portal.filter({ key: 'symfonie' });
    if (portalRows[0]?.is_active === false) {
      return Response.json({ success: true, skipped: true, reason: 'Portal disabled' });
    }

    // Concurrency lease — 2000-task batch with Symfonie chunked OData can run
    // long when the API is under load. Cron overlap would mean duplicate
    // due_date entity updates → duplicate webhook + sheet rewrites for the
    // same diff. TTL = 8 min.
    const LEASE_KEY = 'symfonie_sync_due_lease';
    const LEASE_TTL_MS = 8 * 60 * 1000;
    const leaseToken = crypto.randomUUID();
    const nowMs = Date.now();
    const existingLeaseRows = await base44.asServiceRole.entities.AppSetting
      .filter({ key: LEASE_KEY }).catch(() => []);
    const existingLease = existingLeaseRows[0] || null;
    if (existingLease?.value) {
      try {
        const parsed = JSON.parse(existingLease.value);
        if (parsed?.expires_at && parsed.expires_at > nowMs) {
          console.log(`symfonieSyncAcceptedDueDates skipped: concurrent run holds lease until ${new Date(parsed.expires_at).toISOString()}`);
          return Response.json({ success: true, skipped: true, reason: 'Concurrent run in progress' });
        }
      } catch { /* malformed lease — treat as stale */ }
    }
    const leaseValue = JSON.stringify({ token: leaseToken, expires_at: nowMs + LEASE_TTL_MS });
    if (existingLease) {
      await base44.asServiceRole.entities.AppSetting.update(existingLease.id, { value: leaseValue })
        .catch((e) => console.error('lease update failed (continuing):', e.message));
    } else {
      await base44.asServiceRole.entities.AppSetting.create({ key: LEASE_KEY, value: leaseValue, description: 'Concurrency lease for symfonieSyncAcceptedDueDates. Auto-managed.' })
        .catch((e) => console.error('lease create failed (continuing):', e.message));
    }
    const releaseLease = async () => {
      const rows = await base44.asServiceRole.entities.AppSetting.filter({ key: LEASE_KEY }).catch(() => []);
      if (rows[0]) {
        await base44.asServiceRole.entities.AppSetting.update(rows[0].id, { value: '' })
          .catch((e) => console.error('lease release failed (will expire naturally):', e.message));
      }
    };

    // 1. Pull open accepted Symfonie tasks (due_date in the future).
    //    Filter by status + portal in DB, then narrow to future due_dates client-side
    //    (the entity layer doesn't support gt on date strings in all cases).
    const nowIso = new Date().toISOString();
    const acceptedRows = await base44.asServiceRole.entities.AcceptedTask.filter(
      { portal: 'symfonie', status: 'accepted' },
      '-accepted_at',
      2000
    );
    const openRows = acceptedRows.filter(
      (t) => t.task_id != null && t.due_date && t.due_date > nowIso
    );

    if (openRows.length === 0) {
      await releaseLease();
      return Response.json({ success: true, checked: 0, changed: 0, message: 'No open Symfonie tasks to reconcile' });
    }

    // 2. Batch-fetch current DueDate from Symfonie. Chunk to keep OData URLs sane.
    const token = await getToken();
    const CHUNK = 25;
    const idChunks = [];
    for (let i = 0; i < openRows.length; i += CHUNK) {
      idChunks.push(openRows.slice(i, i + CHUNK).map((t) => Number(t.task_id)));
    }

    const remoteById = new Map(); // task_id (number) -> remote DueDate ISO string
    for (const chunk of idChunks) {
      const filter = chunk.map((id) => `Id eq ${id}`).join(' or ');
      // $select keeps the response tiny — we only need Id + DueDate.
      const url = `${BASE_URL}/Tasks?$filter=${encodeURIComponent(filter)}&$select=Id,DueDate&$top=${chunk.length}`;
      const data = await fetchJsonRetry(url, token);
      for (const row of data.value || []) {
        if (row.Id != null) remoteById.set(Number(row.Id), row.DueDate || null);
      }
    }

    // 3. Diff and write only when the instant actually changed.
    let changed = 0;
    let missing = 0;
    const changes = [];
    for (const t of openRows) {
      const remoteDue = remoteById.get(Number(t.task_id));
      if (remoteDue === undefined) {
        missing++; // task no longer visible in Symfonie OData (completed/canceled upstream)
        continue;
      }
      const localMs = t.due_date ? new Date(t.due_date).getTime() : null;
      const remoteMs = remoteDue ? new Date(remoteDue).getTime() : null;
      if (localMs === remoteMs) continue;

      // The UPDATE here triggers the `AcceptedTask due_date change → notify`
      // entity automation, which runs handleDueDateChange. We do nothing else.
      await base44.asServiceRole.entities.AcceptedTask
        .update(t.id, { due_date: remoteDue })
        .catch((e) => console.error(`AcceptedTask.update failed for ${t.id}:`, e.message));
      changed++;
      changes.push({ task_id: t.task_id, task_name: t.task_name, from: t.due_date, to: remoteDue });
    }

    // Touch the Portal last_sync_at so the UI shows freshness.
    if (portalRows[0]) {
      await base44.asServiceRole.entities.Portal
        .update(portalRows[0].id, { last_sync_at: new Date().toISOString() })
        .catch(() => {});
    }

    await releaseLease();

    return Response.json({
      success: true,
      checked: openRows.length,
      changed,
      missing_in_symfonie: missing,
      changes,
    });
  } catch (error) {
    console.error('symfonieSyncAcceptedDueDates error:', error.message);
    try {
      const b2 = createClientFromRequest(req);
      const rows = await b2.asServiceRole.entities.AppSetting.filter({ key: 'symfonie_sync_due_lease' });
      if (rows[0]) await b2.asServiceRole.entities.AppSetting.update(rows[0].id, { value: '' });
    } catch { /* lease expires on TTL */ }
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});