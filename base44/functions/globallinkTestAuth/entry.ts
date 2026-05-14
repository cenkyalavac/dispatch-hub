// Sağlık probu: broker'ın /proxy/pd üzerinden submissionTargetSearch.pd çağrısı.
// Hub artık PD'ye direkt fetch etmiyor — tüm istekler broker'ın tarayıcı bağlamında
// yapılıyor (cookie/CSRF/JWT/IP hepsi orada doğal olarak sağlam). Hub yalnızca
// broker'a HTTP atıyor ve cevabı yorumluyor.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    await base44.auth.me().catch(() => null);

    const brokerUrl = Deno.env.get('BROKER_URL');
    const brokerKey = Deno.env.get('BROKER_KEY');
    if (!brokerUrl || !brokerKey) {
      return Response.json({
        success: false,
        configured: false,
        error: 'BROKER_URL or BROKER_KEY secret is missing.',
      }, { status: 503 });
    }

    const proxyRes = await fetch(`${brokerUrl.replace(/\/$/, '')}/proxy/pd`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Broker-Key': brokerKey,
      },
      body: JSON.stringify({
        endpoint: 'submissionTargetSearch.pd',
        body: {
          folder: 'AVAILABLE_SUBMISSION',
          entityTickets: [],
          parentEntityTickets: [],
          index: 0,
          size: 1,
        },
      }),
    });

    const text = await proxyRes.text();
    let payload;
    try { payload = JSON.parse(text); } catch { payload = text.slice(0, 400); }

    if (!proxyRes.ok) {
      console.log('[globallinkTestAuth] broker body', text.slice(0, 1000));
      console.log('[globallinkTestAuth] broker meta', { status: proxyRes.status, statusText: proxyRes.statusText });
      return Response.json({
        success: false,
        broker_status: proxyRes.status,
        error: `Broker proxy HTTP ${proxyRes.status}: ${typeof payload === 'string' ? payload : (payload?.error || 'broker error')}`,
        response: payload,
      });
    }

    // Broker envelope: newer version returns { status, bodyJson, bodyText, ... },
    // older returned { ok, status, body }. Support both.
    const pdBody = payload?.bodyJson ?? payload?.body ?? payload;
    const pdStatus = payload?.status ?? 200;
    const success = payload?.ok === true || (pdStatus >= 200 && pdStatus < 300 && pdBody?.success !== false);

    if (!success) {
      return Response.json({
        success: false,
        api_status: pdStatus,
        error: pdBody?.description || pdBody?.reasons || pdBody?.errorMessage || `PD rejected the request (status ${pdStatus}).`,
        response: pdBody,
      });
    }

    return Response.json({
      success: true,
      api_status: pdStatus,
      available_count: pdBody?.gridContentInfo?.totalCount ?? (Array.isArray(pdBody?.items) ? pdBody.items.length : null),
      token_source: 'broker_proxy',
    });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});