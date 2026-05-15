import { useEffect, useRef, useState } from 'react';

const fieldCls = 'w-full h-8 px-2 rounded-md border border-line-1 bg-surface-1 text-[12px] outline-none placeholder:text-ink-4';

// Header input that keeps the user's keystrokes purely local while typing and
// only writes back to the entity on blur (or Enter). The previous implementation
// dispatched an entity.update + refetch on every keystroke, which caused
// dropped/late characters because React re-rendered with stale rows in the
// middle of typing. Selects don't suffer from this — each change is one event.
export default function SheetColumnHeaderInput({ value, onCommit }) {
  const [draft, setDraft] = useState(value || '');
  const original = useRef(value || '');

  // If the upstream value changes from outside (e.g. row reordered, refetched),
  // sync local state — but only when we aren't actively diverging from it.
  useEffect(() => {
    if ((value || '') !== original.current) {
      original.current = value || '';
      setDraft(value || '');
    }
  }, [value]);

  const commit = () => {
    if (draft === original.current) return;
    original.current = draft;
    onCommit(draft);
  };

  return (
    <input
      className={fieldCls}
      value={draft}
      placeholder="e.g. Volume"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
    />
  );
}