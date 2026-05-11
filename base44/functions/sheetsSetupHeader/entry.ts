import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// One-time setup: create header row in Google Sheets
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const spreadsheetId = Deno.env.get('GOOGLE_SHEETS_SPREADSHEET_ID');
    if (!spreadsheetId) return Response.json({ error: 'GOOGLE_SHEETS_SPREADSHEET_ID eksik' }, { status: 400 });

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlesheets');

    const headers = [
      'Task ID', 'Task Adı', 'Proje Adı', 'Müşteri', 'Kaynak Dil', 'Hedef Dil',
      'Kelime Sayısı', 'Fiyat', 'Teslim Tarihi', 'Kabul Tarihi', 'Uygulanan Kural'
    ];

    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A1:K1?valueInputOption=USER_ENTERED`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ values: [headers] })
      }
    );

    if (!res.ok) {
      const err = await res.text();
      return Response.json({ error: 'Header yazılamadı', details: err }, { status: 400 });
    }

    return Response.json({ success: true, message: 'Google Sheets başlık satırı oluşturuldu' });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});