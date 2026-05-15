import { useMemo } from 'react';
import { fmtNumber, EM } from '@/lib/format';

// Builds a sorted, top-N tally from an array using a key getter and a value
// reducer. Keeps the two cards (clients + language pairs) in one place.
function tally(items, keyOf, days = 30) {
  const cutoff = Date.now() - days * 86400000;
  const counts = new Map();
  const words = new Map();
  for (const t of items) {
    const stamp = t.accepted_at || t.created_date;
    if (!stamp || new Date(stamp).getTime() < cutoff) continue;
    if (t.status !== 'accepted') continue;
    const k = keyOf(t);
    if (!k) continue;
    counts.set(k, (counts.get(k) || 0) + 1);
    words.set(k, (words.get(k) || 0) + (t.word_count || 0));
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count, words: words.get(key) || 0 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 7);
}

function Bar({ rows, label, valueLabel }) {
  const max = Math.max(1, ...rows.map(r => r.count));
  return (
    <section className="bg-surface-1 border border-line-1 rounded-md p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[13px] font-semibold text-ink-1">{label}</h3>
        <span className="text-[11px] text-ink-3 italic-editorial">last 30 days</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-[12px] text-ink-3 italic-editorial">No accepted tasks in this window.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.key}>
              <div className="flex items-baseline justify-between mb-0.5">
                <span className="text-[12px] text-ink-1 truncate pr-2">{r.key}</span>
                <span className="text-[11px] text-ink-3 tabular-nums flex-shrink-0">
                  {fmtNumber(r.count)} · {fmtNumber(r.words)} w
                </span>
              </div>
              <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent"
                  style={{ width: `${(r.count / max) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function TopBreakdown({ tasks }) {
  const topClients = useMemo(
    () => tally(tasks, t => t.client_name || t.account_name),
    [tasks]
  );
  const topPairs = useMemo(
    () => tally(tasks, t => (t.source_language && t.target_language) ? `${t.source_language} → ${t.target_language}` : null),
    [tasks]
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-7">
      <Bar rows={topClients} label="Top clients" />
      <Bar rows={topPairs} label="Top language pairs" />
    </div>
  );
}