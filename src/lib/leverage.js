// Reads the flat GlobalLinkSubmission.leverage shape persisted by
// functions/globallinkLeverage. Schema fields:
//   context, rep, match100,
//   fuzzy_95_99_tm, fuzzy_95_99_reps,
//   fuzzy_85_94_tm, fuzzy_85_94_reps,
//   fuzzy_75_84_tm, fuzzy_75_84_reps,
//   fuzzy_50_74_tm, fuzzy_50_74_reps,
//   no_match, total_wc
//
// Per Cenk's spec the table shows TM + Reps summed into a single number per
// fuzzy band, so we collapse them here.
//
// Returns: { context, match100, rep, f9599, f8594, f7584, f5074, noMatch, totalWc }
// All values are numbers (0 if missing).

function n(v) {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  return Number(v) || 0;
}

export function extractLeverage(leverage) {
  if (!leverage || typeof leverage !== 'object') return null;
  if (leverage._unavailable) return null;
  const l = leverage;
  return {
    context:  n(l.context),
    match100: n(l.match100),
    rep:      n(l.rep),
    f9599:    n(l.fuzzy_95_99_tm) + n(l.fuzzy_95_99_reps),
    f8594:    n(l.fuzzy_85_94_tm) + n(l.fuzzy_85_94_reps),
    f7584:    n(l.fuzzy_75_84_tm) + n(l.fuzzy_75_84_reps),
    f5074:    n(l.fuzzy_50_74_tm) + n(l.fuzzy_50_74_reps),
    noMatch:  n(l.no_match),
    totalWc:  n(l.total_wc),
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