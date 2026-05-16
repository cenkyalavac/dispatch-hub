// Anchored documentation section. Renders an `id`-tagged heading so the
// in-page table of contents can deep-link straight to it.
export default function DocSection({ id, title, eyebrow, children }) {
  return (
    <section id={id} className="scroll-mt-24 mb-12">
      {eyebrow && (
        <p className="text-[10px] uppercase tracking-[0.12em] text-ink-3 mb-1.5">{eyebrow}</p>
      )}
      <h2 className="text-[18px] font-semibold tracking-tight text-ink-1 mb-4">{title}</h2>
      <div className="space-y-4 text-[13px] text-ink-2 leading-relaxed">
        {children}
      </div>
    </section>
  );
}