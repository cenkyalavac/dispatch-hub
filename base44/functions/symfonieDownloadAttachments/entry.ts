// Symfonie task icin tum attachment'lari indir ve Dropbox'a yukle.
// Klasor yapisi: /{Account}/{Project}/{TaskId_TaskName}/HO/{filename}
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const TENANT_ID = Deno.env.get('SYMFONIE_TENANT_ID') || 'ead220ab-1743-4c57-83ae-e055f3401f19';
const SCOPE = 'api://c2e8870d-faef-45ea-919c-b603f97bd0cc/.default';
const BASE_URL = 'https://projects.moravia.com/Api/V5';
const SYMFONIE_HOST = 'https://projects.moravia.com/Api';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

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
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString()
  });
  const data = await r.json();
  if (!data.access_token) throw new Error('Symfonie auth failed: ' + JSON.stringify(data));
  return data.access_token;
}

// Symfonie API yogun trafikte 503 verir — exponential backoff
async function symfonieFetch(url, token, init = {}, maxRetries = 4) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const r = await fetch(url, {
      ...init,
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json', ...(init.headers || {}) },
    });
    if (!r.ok && [429, 502, 503, 504].includes(r.status) && attempt < maxRetries) {
      await sleep(Math.min(1000 * 2 ** attempt, 8000));
      continue;
    }
    return r;
  }
}

// Dropbox path icin guvenli isim — illegal karakterleri ve uzunlugu kontrol et
function sanitizePathSegment(s, max = 120) {
  if (!s) return 'unknown';
  return String(s)
    .replace(/[\\/:*?"<>|\n\r\t]+/g, '_')
    .replace(/\.+$/, '')
    .trim()
    .slice(0, max) || 'unknown';
}

// Stream body — RAM tasimadan Symfonie → Dropbox aktarir.
async function dropboxUploadStream(accessToken, path, body, contentLength) {
  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/octet-stream',
    'Dropbox-API-Arg': JSON.stringify({
      path,
      mode: 'overwrite',
      autorename: false,
      mute: true,
      strict_conflict: false,
    }),
  };
  if (contentLength) headers['Content-Length'] = String(contentLength);
  const r = await fetch('https://content.dropboxapi.com/2/files/upload', {
    method: 'POST',
    headers,
    body,
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`Dropbox upload failed (${r.status}): ${text.slice(0, 300)}`);
  }
  return await r.json();
}

// Reads dropbox_base_path + dropbox_folder_template from AppSetting on every invocation.
// Falls back to BeLazy-style defaults if not set. Template tokens: {account} {project} {task_id} {task_name}.
async function resolveHandoffDir(base44, { account, project, task_id, task_name }) {
  const settings = await base44.asServiceRole.entities.AppSetting.filter({}).catch(() => []);
  const get = (k, dflt) => settings.find(s => s.key === k)?.value || dflt;
  const basePath = get('dropbox_base_path', 'Symfonie').replace(/^\/+|\/+$/g, '');
  const template = get('dropbox_folder_template', '{account}/{project}/{task_id}_{task_name}/HO');

  const tokens = {
    account:   sanitizePathSegment(account   || 'Unknown Account'),
    project:   sanitizePathSegment(project   || 'Unknown Project'),
    task_id:   sanitizePathSegment(String(task_id)),
    task_name: sanitizePathSegment(task_name || 'Task'),
  };
  // Replace tokens, then sanitize each resulting path segment so user-supplied template
  // text can't introduce illegal characters or empty segments.
  const filled = template.replace(/\{(\w+)\}/g, (_, k) => tokens[k] ?? `{${k}}`);
  const segments = filled.split('/').map(s => sanitizePathSegment(s)).filter(Boolean);
  return `/${basePath}/${segments.join('/')}`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Admin gate — exposes raw task attachments (PII/IP) and Dropbox writes.
    // Allow scheduled/system calls (no user context) since symfonieAcceptTask
    // and symfonieProcessTasks invoke this via base44.asServiceRole.
    const user = await base44.auth.me().catch(() => null);
    if (user !== null && user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { task_id, task_name, project_name, account_name, project_id, job_id } = await req.json();

    if (!task_id) {
      return Response.json({ error: 'task_id required' }, { status: 400 });
    }

    const symfonieToken = await getSymfonieToken();
    // Dropbox connector resolution. getConnection THROWS when the connector
    // isn't authorized (or its token lapsed) — and because this function is
    // invoked fire-and-forget from the accept paths, a throw here vanishes into
    // a `.catch(console.error)` with zero operator visibility. Raise a deduped
    // SystemIssue so a wedged Dropbox handoff surfaces on the Issues page.
    let dropboxToken;
    try {
      ({ accessToken: dropboxToken } = await base44.asServiceRole.connectors.getConnection('dropbox'));
    } catch (connErr) {
      base44.functions.invoke('recordSystemIssue', {
        type: 'broker_offline',
        severity: 'critical',
        portal: 'symfonie',
        function_name: 'symfonieDownloadAttachments',
        external_ref: String(task_id),
        dedup_key: 'dropbox_connector',
        title: 'Dropbox connector not connected',
        description: `Handoff for task ${task_id} could not run because the Dropbox connector is not authorized: ${connErr.message}\n\nAccepted tasks are NOT getting their files copied to Dropbox until an admin reconnects Dropbox. Reconnect from the integrations panel; handoffs for subsequent accepts will resume automatically.`,
      }).catch((e) => console.error('recordSystemIssue failed:', e.message));
      return Response.json({ error: `Dropbox connector not authorized: ${connErr.message}` }, { status: 503 });
    }

    // 1) Attachment listesini cek
    const listRes = await symfonieFetch(
      `${BASE_URL}/TaskAttachments?$filter=TaskId eq ${task_id}`,
      symfonieToken,
    );
    if (!listRes.ok) {
      const errText = await listRes.text();
      return Response.json({
        error: `Failed to list attachments: ${listRes.status}`,
        details: errText.slice(0, 300),
      }, { status: 502 });
    }
    const listData = await listRes.json();
    const attachments = listData.value || [];

    // 2) Hedef klasor yolu — Settings'ten okunan template ile
    const handoffDir = await resolveHandoffDir(base44, {
      account: account_name, project: project_name, task_id, task_name,
    });

    if (attachments.length === 0) {
      return Response.json({
        success: true,
        task_id,
        handoff_dir: handoffDir,
        attachments_count: 0,
        uploaded: [],
        message: 'No attachments to download.',
      });
    }

    // 3) Her attachment'i indir + Dropbox'a yukle (sirayla, Symfonie rate-limit)
    // Inner helper — single attachment indirir, Dropbox'a yukler, ProjectAttachment kaydeder.
    async function downloadOne(att, targetDir, kind) {
      try {
        const dlUrl = `${SYMFONIE_HOST}/${att.DownloadUrl}`;
        const fileRes = await symfonieFetch(dlUrl, symfonieToken, { headers: { 'Accept': '*/*' } });
        if (!fileRes.ok) {
          await sleep(400);
          return { ok: false, id: att.Id, name: att.Name, error: `download ${fileRes.status}` };
        }
        const safeName = sanitizePathSegment(att.Name, 200);
        const dropboxPath = `${targetDir}/${safeName}`;
        const contentLength = fileRes.headers.get('content-length');
        const result = await dropboxUploadStream(dropboxToken, dropboxPath, fileRes.body, contentLength);

        if (project_id) {
          base44.asServiceRole.entities.ProjectAttachment.create({
            tenant_id: 'default',
            project_id,
            external_id: String(att.Id),
            name: att.Name,
            size: result.size || 0,
            storage: 'dropbox',
            storage_path: result.path_display,
            kind,
            uploaded_at: new Date().toISOString(),
          }).catch((e) => console.error('ProjectAttachment create failed:', e.message));
        }
        await sleep(300);
        return { ok: true, id: att.Id, name: att.Name, path: result.path_display, size: result.size };
      } catch (err) {
        return { ok: false, id: att.Id, name: att.Name, error: err.message };
      }
    }

    const uploaded = [];
    const failed = [];
    for (const att of attachments) {
      const r = await downloadOne(att, handoffDir, 'handoff');
      (r.ok ? uploaded : failed).push(r);
    }

    // 4) JobAttachments pass — Belazy "RE/" parite. Job-level reference dosyalari
    // (style guide, glossary, brief) her task'in HO/'sunun YANINA degil, task
    // klasorunun KARDESI olarak RE/'ye iner. Reference dosyalari job genelinde
    // ortak — her task icin tekrar indirmek hem disk israfi hem rate-limit cezasi.
    //
    // Klasor matematigi: handoffDir = .../{task_id}_{task_name}/HO
    //                    referenceDir = .../{task_id}_{task_name}/RE  (kardes)
    // Boylece "task surrogate" altinda HO ve RE birlikte yasar; Belazy davranisi.
    const jobUploaded = [];
    const jobFailed = [];
    let referenceDir = null;
    if (job_id) {
      // Replace trailing "/HO" with "/RE". If template doesn't end with HO,
      // place RE as a sibling of the last segment.
      if (/\/HO$/.test(handoffDir)) {
        referenceDir = handoffDir.replace(/\/HO$/, '/RE');
      } else {
        // Strip last segment, append /RE
        const parts = handoffDir.split('/');
        parts[parts.length - 1] = 'RE';
        referenceDir = parts.join('/');
      }

      try {
        const jobListRes = await symfonieFetch(
          `${BASE_URL}/JobAttachments?$filter=JobId eq ${job_id}`,
          symfonieToken,
        );
        if (jobListRes.ok) {
          const jobListData = await jobListRes.json();
          const jobAttachments = jobListData.value || [];
          for (const att of jobAttachments) {
            const r = await downloadOne(att, referenceDir, 'reference');
            (r.ok ? jobUploaded : jobFailed).push(r);
          }
        } else {
          console.error(`JobAttachments list failed (${jobListRes.status}):`, (await jobListRes.text()).slice(0, 200));
        }
      } catch (e) {
        console.error('JobAttachments pass error:', e.message);
      }
    }

    return Response.json({
      success: failed.length === 0 && jobFailed.length === 0,
      task_id,
      job_id: job_id || null,
      handoff_dir: handoffDir,
      reference_dir: referenceDir,
      attachments_count: attachments.length,
      job_attachments_count: jobUploaded.length + jobFailed.length,
      uploaded,
      failed,
      job_uploaded: jobUploaded,
      job_failed: jobFailed,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});