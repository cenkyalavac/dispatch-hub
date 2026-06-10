import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';

const ITEMS = [
  { label: 'Overview',          to: '/' },
  // Pending queues live per-portal (/portals/:key?tab=pending) — land on the
  // connector grid where each card links into its own pending tab. A bare
  // /pending route does not exist; the old entry 404'd.
  { label: 'Pending',           to: '/portals' },
  { label: 'Issues',            to: '/issues' },
  { label: 'History',           to: '/history' },
  { label: 'Activity',          to: '/tasks' },
  { label: 'Connectors',        to: '/portals' },
  { label: 'Rules',             to: '/rules' },
  { label: 'API · Keys',        to: '/api' },
  { label: 'API · Mappings',    to: '/mappings' },
  { label: 'Settings',          to: '/settings' },
];

export default function CommandPalette({ open, onClose }) {
  const [q, setQ] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (open) setQ('');
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    if (open) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const filtered = ITEMS.filter(it => !q || it.label.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 bg-ink-1/10 backdrop-blur-sm flex items-start justify-center pt-[15vh]" onClick={onClose}>
      <div
        className="w-full max-w-md bg-surface-1 border border-line-1 rounded-lg shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 h-11 border-b border-line-1">
          <Search className="w-3.5 h-3.5 text-ink-3" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Jump to…"
            className="flex-1 bg-transparent outline-none text-[13px] placeholder:text-ink-4"
          />
          <kbd className="text-[10px] font-mono text-ink-4">esc</kbd>
        </div>
        <div className="py-1 max-h-72 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-4 py-3 text-[12px] text-ink-3 italic-editorial">Nothing matches.</p>
          ) : filtered.map((it) => (
            <button
              key={it.to}
              onClick={() => { navigate(it.to); onClose(); }}
              className="w-full text-left px-4 h-9 text-[13px] text-ink-1 hover:bg-surface-2 transition-colors duration-tab"
            >
              {it.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}