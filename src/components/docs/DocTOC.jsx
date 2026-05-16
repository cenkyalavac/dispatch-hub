// Sticky in-page table of contents for the Documentation page. Pure anchor
// links — no JS scroll-spy, keeps the page lightweight.
export default function DocTOC({ items }) {
  return (
    <nav className="sticky top-[108px] hidden lg:block w-52 shrink-0">
      <p className="text-[10px] uppercase tracking-[0.12em] text-ink-3 mb-2">On this page</p>
      <ul className="space-y-1.5 text-[12.5px]">
        {items.map((it) => (
          <li key={it.id}>
            <a
              href={`#${it.id}`}
              className="block py-0.5 text-ink-3 hover:text-ink-1 transition-colors duration-tab"
            >
              {it.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}