// Single source of truth for number / placeholder formatting.
export const EM = '—';

export function fmtNumber(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return EM;
  const v = Number(n);
  if (!Number.isFinite(v)) return EM;
  return v.toLocaleString('en-US');
}