// Junction-only segment switch for the three offer pools:
//   me        → offers exclusively addressed to this account
//   available → first-come-first-served pool open to all qualified vendors
//   rosters   → offers visible to the team (multi-vendor decision)
//
// Lives outside PendingTab so Symfonie/GlobalLink rendering stays unchanged.

const OPTIONS = [
  { key: 'me',        label: 'My Offers' },
  { key: 'available', label: 'Open' },
  { key: 'rosters',   label: 'Team' },
];

export default function JunctionOfferTypeSwitch({ value, onChange, counts = {} }) {
  return (
    <div className="inline-flex items-center gap-1 p-0.5 rounded-md bg-surface-2 border border-line-1">
      {OPTIONS.map((opt) => {
        const active = value === opt.key;
        const count = counts[opt.key];
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => onChange(opt.key)}
            className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded text-[11px] font-medium transition-colors duration-tab ${
              active
                ? 'bg-surface-1 text-ink-1 shadow-sm'
                : 'text-ink-3 hover:text-ink-1'
            }`}
          >
            {opt.label}
            {count != null && (
              <span className={`tabular-nums ${active ? 'text-ink-3' : 'text-ink-4'}`}>
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}