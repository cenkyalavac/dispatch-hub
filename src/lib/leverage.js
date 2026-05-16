// Leverage utilities — normalize PD's cumulativeTmStatistics into our 12 bands
// (8 Excel-spec bands + 4 separate Reps bands) and compute the MTPE-aligned WWC.
//
// PD returns up to 12 named bands. Until 2026-05 we collapsed each Reps band
// into its fuzzy sibling, but the canonical pipeline (functions/globallinkPoll
// + AcceptedTask.weighted_wc) keeps them separate so the MTPE WWC formula can
// weight Reps differently from pure fuzzy. This file is now consistent with
// both — Rep bands stay separate, and computeWwc matches the pipeline formula.
//
// WWC formula (MTPE-aligned — Reps share the same weight as their fuzzy band):
//   (95-99 + Reps95-99) * 0.2
// + (85-94 + Reps85-94) * 0.35
// + (75-84 + Reps75-84) * 0.45
// + (50-74 + Reps50-74 + NoMatch) * 0.6
// Context / pure-rep / 100% bands carry zero weight (free under MTPE).

const num = (v) => Number(v) || 0;

// Map a PD band name → our band key. Returns null if unrecognized.
function bandKey(name) {
  const n = String(name || '').toLowerCase().replace(/\s+/g, '');
  if (n === 'incontextmatch') return 'context';
  if (n === 'repetitions') return 'rep';
  if (n === 'match100') return 'match100';
  if (n === '95%-99%') return 'f9599';
  if (n === '85%-94%') return 'f8594';
  if (n === '75%-84%') return 'f7584';
  if (n === '50%-74%') return 'f5074';
  if (n === 'reps95%-99%') return 'rep_9599';
  if (n === 'reps85%-94%') return 'rep_8594';
  if (n === 'reps75%-84%') return 'rep_7584';
  if (n === 'reps50%-74%') return 'rep_5074';
  if (n === 'nomatch') return 'no_match';
  return null;
}

// Flatten cumulativeTmStatistics array → { context, rep, match100, f9599, ... }
export function normalizeLeverage(cumulativeTmStatistics) {
  const out = {
    context: 0, rep: 0, match100: 0,
    f9599: 0, f8594: 0, f7584: 0, f5074: 0,
    rep_9599: 0, rep_8594: 0, rep_7584: 0, rep_5074: 0,
    no_match: 0,
  };
  if (!Array.isArray(cumulativeTmStatistics)) return out;
  for (const b of cumulativeTmStatistics) {
    const k = bandKey(b?.name);
    if (k) out[k] += num(b.wordCount);
  }
  return out;
}

// Compute WWC from the normalized bands. Matches functions/globallinkPoll.
export function computeWwc(lev) {
  if (!lev) return 0;
  return Math.round(
      (num(lev.f9599) + num(lev.rep_9599)) * 0.2
    + (num(lev.f8594) + num(lev.rep_8594)) * 0.35
    + (num(lev.f7584) + num(lev.rep_7584)) * 0.45
    + (num(lev.f5074) + num(lev.rep_5074) + num(lev.no_match)) * 0.6
  );
}

// Extract leverage from a stored GlobalLinkSubmission row (for UI rendering).
// Combines fuzzy + Reps for the displayed band totals so the table matches the
// 8-column Excel spec — the underlying DB rows keep them separate for accurate
// WWC computation by the pipeline.
export function extractLeverage(row) {
  if (!row) return null;
  return {
    context: num(row.lev_context),
    rep: num(row.lev_rep),
    match100: num(row.lev_match100),
    f9599: num(row.lev_9599) + num(row.lev_rep_9599),
    f8594: num(row.lev_8594) + num(row.lev_rep_8594),
    f7584: num(row.lev_7584) + num(row.lev_rep_7584),
    f5074: num(row.lev_5074) + num(row.lev_rep_5074),
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