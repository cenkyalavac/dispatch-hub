// Shared CSV export utility. Quote every cell so commas/quotes/newlines can't break columns.
// \r\n + UTF-8 BOM = Excel-safe (RFC 4180 + Windows-compatible UTF-8 detection).
const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

export function downloadCsv(filename, headers, rows) {
  const csv = '\uFEFF' + [
    headers.map(csvCell).join(','),
    ...rows.map(r => r.map(csvCell).join(',')),
  ].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}