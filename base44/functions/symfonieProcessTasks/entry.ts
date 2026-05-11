import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Helper: get Symfonie token (Moravia Login or Azure AD)
async function getSymfonieToken() {
  const clientId = Deno.env.get('SYMFONIE_CLIENT_ID');
  const clientSecret = Deno.env.get('SYMFONIE_CLIENT_SECRET');
  const tenantId = Deno.env.get('SYMFONIE_TENANT_ID');

  // Moravia Login (primary) — Azure AD only if explicitly set
  const serviceAccount = Deno.env.get('SYMFONIE_SERVICE_ACCOUNT');
  let tokenRes;
  if (serviceAccount) {
    const params = new URLSearchParams();
    params.append('grant_type', 'service');
    params.append('client_id', clientId);
    params.append('client_secret', clientSecret);
    params.append('scope', 'symfonie2-api');
    params.append('service_account', serviceAccount);
    tokenRes = await fetch('https://login.moravia.com/connect/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });
  } else if (tenantId) {
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', clientId);
    params.append('client_secret', clientSecret);
    params.append('scope', 'api://c2e8870d-faef-45ea-919c-b603f97bd0cc/.default');
    tokenRes = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });
  } else {
    throw new Error('SYMFONIE_SERVICE_ACCOUNT veya SYMFONIE_TENANT_ID gerekli');
  }

  if (!tokenRes.ok) throw new Error('Symfonie token alınamadı: ' + await tokenRes.text());
  const d = await tokenRes.json();
  return d.access_token;
}

function evaluateCondition(condition, task) {
  const { field, operator, value } = condition;
  let taskValue = '';

  switch (field) {
    case 'project_name': taskValue = (task.project_name || '').toLowerCase(); break;
    case 'source_language': taskValue = (task.source_language || '').toLowerCase(); break;
    case 'target_language': taskValue = (task.target_language || '').toLowerCase(); break;
    case 'client_name': taskValue = (task.client_name || '').toLowerCase(); break;
    case 'word_count': taskValue = task.word_count || 0; break;
    case 'price': taskValue = task.price || 0; break;
    case 'quantity': taskValue = task.word_count || 0; break;
    default: return true;
  }

  const compareValue = value && value.toLowerCase ? value.toLowerCase() : Number(value);

  switch (operator) {
    case 'contains': return String(taskValue).includes(String(compareValue));
    case 'not_contains': return !String(taskValue).includes(String(compareValue));
    case 'equals': return String(taskValue) === String(compareValue);
    case 'starts_with': return String(taskValue).startsWith(String(compareValue));
    case 'greater_than': return Number(taskValue) > Number(compareValue);
    case 'less_than': return Number(taskValue) < Number(compareValue);
    case 'greater_equal': return Number(taskValue) >= Number(compareValue);
    case 'less_equal': return Number(taskValue) <= Number(compareValue);
    default: return true;
  }
}

function matchesRule(rule, task) {
  if (!rule.conditions || rule.conditions.length === 0) return true;
  return rule.conditions.every(c => evaluateCondition(c, task));
}

async function acceptTaskInSymfonie(taskId, token) {
  const res = await fetch(`https://projects.moravia.com/api/V5/Tasks(${taskId})`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({ AcceptedDate: new Date().toISOString() })
  });
  return res.ok;
}

async function appendToSheets(base44, taskRecord) {
  const spreadsheetId = Deno.env.get('GOOGLE_SHEETS_SPREADSHEET_ID');
  if (!spreadsheetId) return false;

  const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlesheets');

  const row = [
    taskRecord.task_id,
    taskRecord.task_name,
    taskRecord.project_name || '',
    taskRecord.client_name || '',
    taskRecord.source_language || '',
    taskRecord.target_language || '',
    taskRecord.word_count || '',
    taskRecord.price || '',
    taskRecord.due_date || '',
    taskRecord.accepted_at || '',
    taskRecord.matched_rule || ''
  ];

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A1:append?valueInputOption=USER_ENTERED`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ values: [row] })
    }
  );
  return res.ok;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Scheduled automation'larda kullanıcı olmaz, service role ile çalışırız
    // Manuel çağrıda kullanıcı kontrolü (opsiyonel)
    const user = await base44.auth.me().catch(() => null);
    if (user && user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin only' }, { status: 403 });
    }

    console.log('symfonieProcessTasks başladı, kullanıcı:', user?.email || 'scheduled/system');

    // 1. Get active rules sorted by priority
    const rules = await base44.asServiceRole.entities.Rule.filter({ is_active: true }, 'priority', 100);
    console.log(`${rules.length} aktif kural bulundu`);

    // 2. Get Symfonie token
    const token = await getSymfonieToken();
    console.log('Symfonie token alındı');

    // 3. Fetch ToDo tasks from Symfonie
    const tasksRes = await fetch(
      `https://projects.moravia.com/api/V5/Tasks?$filter=State eq 'ToDo'&$expand=FinanceRows,Project&$top=200`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      }
    );

    if (!tasksRes.ok) {
      const err = await tasksRes.text();
      console.error('Task listesi alınamadı:', err);
      return Response.json({ error: 'Task listesi alınamadı', details: err }, { status: 400 });
    }

    const data = await tasksRes.json();
    const rawTasks = data.value || [];
    console.log(`${rawTasks.length} ToDo task bulundu`);

    // 4. Get already processed task IDs to avoid duplicates
    const existing = await base44.asServiceRole.entities.AcceptedTask.filter({}, '-created_date', 1000);
    const existingIds = new Set(existing.map(t => t.task_id));

    const results = { accepted: [], rejected: [], skipped: [], errors: [] };

    for (const raw of rawTasks) {
      if (existingIds.has(raw.Id)) {
        results.skipped.push(raw.Id);
        continue;
      }

      let wordCount = 0;
      let price = 0;
      if (raw.FinanceRows && raw.FinanceRows.length > 0) {
        wordCount = raw.FinanceRows.reduce((sum, r) => sum + (r.Quantity || 0), 0);
        price = raw.FinanceRows.reduce((sum, r) => sum + (r.TotalPrice || 0), 0);
      }

      const task = {
        task_id: raw.Id,
        task_name: raw.Name || '',
        project_name: raw.Project?.Name || raw.JobName || '',
        client_name: raw.Project?.CustomerName || '',
        source_language: raw.SourceLanguageCode || '',
        target_language: raw.TargetLanguageCode || '',
        word_count: wordCount,
        price: price,
        due_date: raw.DueDate || null,
        accepted_at: new Date().toISOString(),
        matched_rule: null,
        status: 'rejected',
        portal: 'symfonie',
        sheets_synced: false
      };

      let matchedRule = null;
      for (const rule of rules) {
        if (matchesRule(rule, task)) {
          matchedRule = rule;
          break;
        }
      }

      if (matchedRule && matchedRule.action === 'accept') {
        task.matched_rule = matchedRule.name;
        task.status = 'accepted';

        const accepted = await acceptTaskInSymfonie(raw.Id, token);
        console.log(`Task ${raw.Id} kabul edildi:`, accepted);

        const saved = await base44.asServiceRole.entities.AcceptedTask.create(task);

        const synced = await appendToSheets(base44, task);
        if (synced) {
          await base44.asServiceRole.entities.AcceptedTask.update(saved.id, { sheets_synced: true });
        }

        results.accepted.push({ id: raw.Id, name: raw.Name, rule: matchedRule.name });
      } else if (matchedRule && matchedRule.action === 'reject') {
        task.matched_rule = matchedRule.name;
        task.status = 'rejected';
        await base44.asServiceRole.entities.AcceptedTask.create(task);
        results.rejected.push({ id: raw.Id, name: raw.Name, rule: matchedRule.name });
      } else {
        results.skipped.push(raw.Id);
      }
    }

    console.log('Tamamlandı:', results.accepted.length, 'kabul,', results.rejected.length, 'red');

    return Response.json({
      success: true,
      summary: {
        total: rawTasks.length,
        accepted: results.accepted.length,
        rejected: results.rejected.length,
        skipped: results.skipped.length
      },
      details: results
    });
  } catch (error) {
    console.error('symfonieProcessTasks hatası:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});