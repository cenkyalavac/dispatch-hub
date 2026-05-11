import { useMemo } from 'react';
import { X } from 'lucide-react';
import { fmtNumber } from '@/lib/format';

/**
 * Compact filter bar for the pending tasks page.
 * All options are derived from the current `tasks` array so the user only sees
 * values that actually exist in the data.
 *
 * value shape: { account, langPair, workflow, dueWindow, hasPrice, sortBy }
 *  - account:    string | 'all'
 *  - langPair:   'src→tgt' | 'all'
 *  - workflow:   string | 'all'
 *  - dueWindow:  'all' | 'overdue' | 'today' | '3d' | '7d'
 *  - hasPrice:   'all' | 'priced' | 'zero'
 *  - sortBy:     'due_asc' | 'due_desc' | 'price_desc' | 'words_desc' | 'created_desc'
 */
export default function PendingFilters({ tasks, value, onChange, onReset, activeCount }) {
  const { accounts, langPairs, workflows } = useMemo(() => {
    const a = new Map(); // name -> count
    const l = new Map();
    const w = new Map();
    for (const t of tasks) {
      if (t.account_name) a.set(t.account_name, (a.get(t.account_name) || 0) + 1);
      if (t.source_language && t.target_language) {
        const key = `${t.source_language}→${t.target_language}`;
        l.set(key, (l.get(key) || 0) + 1);
      }
      if (t.workflow_name) w.set(t.workflow_name, (w.get(t.workflow_name) || 0) + 1);
    }
    const toSorted = (m) =>
      [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    return { accounts: toSorted(a), langPairs: toSorted(l), workflows: toSorted(w) };
  }, [tasks]);

  const set = (k, v) => onChange({ ...value, [k]: v });

  const baseSelectCls =
    'h-8 px-2 pr-7 rounded-md border border-line-1 bg-surface-1 text-[12px] text-ink-1 outline-none hover:bg-surface-2 transition-colors duration-tab cursor-pointer';

  const isFiltered =
    value.account !== 'all' ||
    value.langPair !== 'all' ||
    value.workflow !== 'all' ||
    value.dueWindow !== 'all' ||
    value.hasPrice !== 'all';

  return (
    <div className="flex items-center gap-2 flex-wrap mb-4">
      <select className={baseSelectCls} value={value.account} onChange={(e) => set('account', e.target.value)}>
        <option value="all">All accounts ({fmtNumber(tasks.length)})</option>
        {accounts.map(([name, count]) => (
          <option key={name} value={name}>{name} ({count})</option>
        ))}
      </select>

      <select className={baseSelectCls} value={value.langPair} onChange={(e) => set('langPair', e.target.value)}>
        <option value="all">All languages</option>
        {langPairs.map(([pair, count]) => (
          <option key={pair} value={pair}>{pair} ({count})</option>
        ))}
      </select>

      <select className={baseSelectCls} value={value.workflow} onChange={(e) => set('workflow', e.target.value)}>
        <option value="all">All workflows</option>
        {workflows.map(([name, count]) => (
          <option key={name} value={name}>{name} ({count})</option>
        ))}
      </select>

      <select className={baseSelectCls} value={value.dueWindow} onChange={(e) => set('dueWindow', e.target.value)}>
        <option value="all">Any due</option>
        <option value="overdue">Overdue</option>
        <option value="today">Due today</option>
        <option value="3d">Next 3 days</option>
        <option value="7d">Next 7 days</option>
      </select>

      <select className={baseSelectCls} value={value.hasPrice} onChange={(e) => set('hasPrice', e.target.value)}>
        <option value="all">Any price</option>
        <option value="priced">Has price</option>
        <option value="zero">Zero / unpriced</option>
      </select>

      <div className="h-5 w-px bg-line-1" />

      <select className={baseSelectCls} value={value.sortBy} onChange={(e) => set('sortBy', e.target.value)}>
        <option value="due_asc">Due ↑ (soonest)</option>
        <option value="due_desc">Due ↓</option>
        <option value="price_desc">Price ↓</option>
        <option value="words_desc">Words ↓</option>
        <option value="created_desc">Newest</option>
      </select>

      {isFiltered && (
        <button
          onClick={onReset}
          className="inline-flex items-center gap-1 h-8 px-2 rounded-md text-[12px] text-ink-3 hover:bg-surface-2 hover:text-ink-1 transition-colors duration-tab"
        >
          <X className="w-3 h-3" /> Clear ({activeCount})
        </button>
      )}
    </div>
  );
}