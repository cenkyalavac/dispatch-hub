// Junction leverage breakdown — one mini-table per task, hydrated from the
// taskDetails array surfaced by junctionGetTaskDetail.
//
// Why a separate file: detail panel was getting busy and the leverage grid is
// portal-specific. Keeping it isolated means Symfonie/GlobalLink can't acquire
// Junction-flavoured columns by accident.
//
// MT column is FIRST-CLASS here — Junction's mtPostEdit band has a different
// WWC weight (0.70) than newWords (1.00), so it needs to be visible alongside
// the fuzzy bands rather than folded into "No match".

const BANDS = [
  { key: 'context',      label: 'Ctx'    },
  { key: 'rep',          label: 'Rep'   },
  { key: 'match100',     label: '100%'  },
  { key: 'fuzzy_95_99',  label: '95-99' },
  { key: 'fuzzy_85_94',  label: '85-94' },
  { key: 'fuzzy_75_84',  label: '75-84' },
  { key: 'mt_post_edit', label: 'MT'    },
  { key: 'no_match',     label: 'New'   },
];

const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('en-US'));

export default function JunctionLeveragePanel({ leverage }) {
  if (!leverage) return null;
  const bands = leverage.bands || {};
  const total = BANDS.reduce((s, b) => s + (Number(bands[b.key]) || 0), 0);
  if (total === 0 && !leverage.weighted_wc) return null;

  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-ink-3 mb-1.5">
        Word-count analysis
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px] border border-line-1 rounded">
          <thead className="bg-surface-2 text-[9px] uppercase tracking-wider text-ink-3">
            <tr>
              {BANDS.map((b) => (
                <th key={b.key} className="px-2 py-1.5 text-right font-medium">{b.label}</th>
              ))}
              <th className="px-2 py-1.5 text-right font-medium">Total</th>
              <th className="px-2 py-1.5 text-right font-medium">WWC</th>
            </tr>
          </thead>
          <tbody>
            <tr className="bg-surface-1">
              {BANDS.map((b) => (
                <td key={b.key} className="px-2 py-1.5 text-right text-ink-2 tabular-nums">
                  {fmt(bands[b.key])}
                </td>
              ))}
              <td className="px-2 py-1.5 text-right text-ink-1 tabular-nums font-semibold">{fmt(total)}</td>
              <td className="px-2 py-1.5 text-right text-ink-1 tabular-nums font-semibold">
                {fmt(leverage.weighted_wc)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      {leverage.mt_weight_coefficient != null && Number(bands.mt_post_edit) > 0 && (
        <p className="mt-1 text-[10px] text-ink-3 italic-editorial">
          MT weighted at {Number(leverage.mt_weight_coefficient).toFixed(2)}× in WWC (program default).
        </p>
      )}
    </div>
  );
}