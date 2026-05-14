// Leverage utilities — normalize PD's cumulativeTmStatistics into the
// 8 Excel-spec bands and compute WWC.
//
// PD returns up to 12 named bands; we combine each fuzzy band with its Reps
// counterpart into one Excel-spec band (95-99 = "95% - 99%" + "Reps95% - 99%").
//
// WWC formula (industry-standard, supplied by the user):
//   WWC = Context*0 + Rep*0.2 + 100%*0.2
//       + (95-99)*0.4 + (85-94)*0.6 + (75-84)*0.8 + (50-74)*1.0 + NoMatch*1.0

const num = (v) => Number(v) || 0;

// Map a PD band name → our band key. Returns null if unrecognized.
function bandKey(name) {
  const n = String(name || '').toLowerCase().replace(/\s+/g, '');
  if (n === 'incontextmatch') return 'context';
  if (n === 'repetitions') return 'rep';
  if (n === 'match100') return 'match100';
  if (n === '95%-99%' || n === 'reps95%-99%') return 'f9599';
  if (n === '85%-94%' || n === 'reps85%-94%') return 'f8594';
  if (n === '75%-84%' || n === 'reps75%-84%') return 'f7584';
  if (n === '50%-74%' || n === 'reps50%-74%') return 'f5074';
  if (n === 'nomatch') return 'no_match';
  return null;
}

// Flatten cumulativeTmStatistics array → { context, rep, match100, f9599, ... }
export function normalizeLeverage(cumulativeTmStatistics) {
  const out = {
    context: 0, rep: 0, match100: 0,
    f9599: 0, f8594: 0, f7584: 0, f5074: 0,
    no_match: 0,
  };
  if (!Array.isArray(cumulativeTmStatistics)) return out;
  for (const b of cumulativeTmStatistics) {
    const k = bandKey(b?.name);
    if (k) out[k] += num(b.wordCount);
  }
  return out;
}

// Compute WWC from the 8 normalized bands.
export function computeWwc(lev) {
  if (!lev) return 0;
  return Math.round(
    num(lev.context) * 0
    + num(lev.rep) * 0.2
    + num(lev.match100) * 0.2
    + num(lev.f9599) * 0.4
    + num(lev.f8594) * 0.6
    + num(lev.f7584) * 0.8
    + num(lev.f5074) * 1.0
    + num(lev.no_match) * 1.0
  );
}

// Extract leverage from a stored GlobalLinkSubmission row (for UI rendering).
export function extractLeverage(row) {
  if (!row) return null;
  return {
    context: num(row.lev_context),
    rep: num(row.lev_rep),
    match100: num(row.lev_match100),
    f9599: num(row.lev_9599),
    f8594: num(row.lev_8594),
    f7584: num(row.lev_7584),
    f5074: num(row.lev_5074),
    no_match: num(row.lev_no_match),
    total: num(row.word_count),
    wwc: num(row.weighted_wc),
  };
}

// dd.MM.yyyy HH:mm in Europe/Istanbul.
export function formatTrDeadline(input) {
  if (!input) return '—';
  const d = typeof input === 'number' ? new Date(input) : new Date(input);
  if (isNaN(d.getTime())) return '—';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Istanbul',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d);
  const get = (t) => parts.find(p => p.type === t)?.value || '';
  return `${get('day')}.${get('month')}.${get('year')} ${get('hour')}:${get('minute')}`;
}