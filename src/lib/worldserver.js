// Display mappings + helpers for WorldServer projects. Single source of truth so
// the list, detail, and filters all render vendors/statuses identically.

export const VENDOR_LABELS = {
  'lionbridge-en-tr': 'Lionbridge · EN → TR',
  'rws-en-tr': 'RWS · EN → TR',
  'toin-en-tr': 'TOIN · EN → TR',
  'toin-en-ar': 'TOIN · EN → AR',
  'toin-en-ru': 'TOIN · EN → RU',
};

export const VENDOR_OPTIONS = Object.keys(VENDOR_LABELS);

export function vendorLabel(slug) {
  return VENDOR_LABELS[slug] || slug || '—';
}

export const LOCALE_OPTIONS = ['Turkish', 'Arabic', 'Russian'];

// Status → label + restrained color classes. Kept as literal Tailwind strings
// so the purge step keeps them.
export const STATUS_META = {
  new: {
    label: 'New',
    pill: 'bg-accent-soft text-accent-ink',
    dot: 'bg-accent',
  },
  in_translate: {
    label: 'In translation',
    pill: 'bg-warning-soft text-[var(--warning)]',
    dot: 'bg-warning',
  },
  delivered: {
    label: 'Delivered',
    pill: 'bg-success-soft text-[var(--success)]',
    dot: 'bg-success',
  },
};

export const STATUS_OPTIONS = ['new', 'in_translate', 'delivered'];

export function statusMeta(status) {
  return STATUS_META[status] || { label: status || '—', pill: 'bg-surface-2 text-ink-2', dot: 'bg-ink-4' };
}

// WS dates can be ISO or a free-form WS string — parse defensively.
export function parseWsDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Default sort: dueDate ascending (blank dues last), then creationDate descending.
export function sortProjects(rows) {
  return [...rows].sort((a, b) => {
    const da = parseWsDate(a.dueDate);
    const db = parseWsDate(b.dueDate);
    if (da && db) {
      if (da.getTime() !== db.getTime()) return da.getTime() - db.getTime();
    } else if (da && !db) {
      return -1;
    } else if (!da && db) {
      return 1;
    }
    const ca = parseWsDate(a.creationDate)?.getTime() || 0;
    const cb = parseWsDate(b.creationDate)?.getTime() || 0;
    return cb - ca;
  });
}