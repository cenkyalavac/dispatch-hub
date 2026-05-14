// Maps the raw GlobalLink `cumulativeTmStatistics` object (or `tmStatistics`)
// into a flat shape the table uses. PD returns each band as a nested object
// `{ wordCount, segmentCount, ... }`, plus separate `fuzzyRepetitionsWordCountN`
// for the in-fuzzy-band repetition counts. Per Cenk's spec we sum TM + Reps
// into a single number for each fuzzy band.
//
// Returns: { context, match100, rep, f9599, f8594, f7584, f5074, noMatch, totalWc }
// All values are numbers (0 if missing).

function n(v) {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'object') return Number(v.wordCount ?? v.words ?? v.count ?? 0) || 0;
  return Number(v) || 0;
}

export function extractLeverage(leverage) {
  if (!leverage || typeof leverage !== 'object') return null;
  const l = leverage;
  return {
    context:  n(l.inContextMatchWordCount),
    match100: n(l.oneHundredMatchWordCount),
    rep:      n(l.repetitionWordCount),
    f9599:    n(l.fuzzyWordCount1) + n(l.fuzzyRepetitionsWordCount1),
    f8594:    n(l.fuzzyWordCount2) + n(l.fuzzyRepetitionsWordCount2),
    f7584:    n(l.fuzzyWordCount3) + n(l.fuzzyRepetitionsWordCount3),
    f5074:    n(l.fuzzyWordCount4) + n(l.fuzzyRepetitionsWordCount4),
    noMatch:  n(l.noMatchWordCount),
    totalWc:  n(l.totalWordCount),
  };
}

// dd.MM.yyyy HH:mm in Europe/Istanbul, from either ISO string or epoch ms.
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