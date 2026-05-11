import { NavLink } from 'react-router-dom';

export default function SubNav({ items = [] }) {
  if (!items || items.length === 0) return null;

  return (
    <div
      style={{ height: 40 }}
      className="sticky top-[52px] z-30 bg-surface-1 border-b border-line-1 flex items-center px-5"
    >
      <nav className="flex items-center gap-1">
        {items.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            end={it.end}
            className={({ isActive }) =>
              `h-7 px-2.5 inline-flex items-center text-[12px] font-medium rounded transition-colors duration-tab
              ${isActive ? 'text-ink-1 bg-surface-2' : 'text-ink-3 hover:text-ink-1 hover:bg-surface-2'}`
            }
          >
            {it.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}