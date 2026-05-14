// Lightweight tab strip. Avoids shadcn Tabs to keep markup minimal and
// to render counts inline (e.g. "Rules · 4").

export default function PortalTabs({ tabs, active, onChange }) {
  return (
    <nav className="flex items-center gap-1 border-b border-line-1 mb-6 overflow-x-auto">
      {tabs.map((t) => {
        const isActive = active === t.key;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            className={`relative h-9 px-3 text-[13px] font-medium transition-colors duration-tab whitespace-nowrap ${
              isActive ? 'text-ink-1' : 'text-ink-3 hover:text-ink-1'
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              {t.icon && <t.icon className="w-3.5 h-3.5" />}
              {t.label}
              {typeof t.count === 'number' && (
                <span className={`text-[10px] tabular-nums ${isActive ? 'text-accent-ink' : 'text-ink-4'}`}>
                  {t.count}
                </span>
              )}
            </span>
            {isActive && (
              <span className="absolute left-0 right-0 -bottom-px h-[2px] bg-accent" />
            )}
          </button>
        );
      })}
    </nav>
  );
}