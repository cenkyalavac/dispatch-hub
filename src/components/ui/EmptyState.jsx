export default function EmptyState({ title, body, cta = null, action = null }) {
  return (
    <div className="bg-surface-1 border border-dashed border-line-2 rounded-md px-8 py-12 text-center">
      <h3 className="text-[14px] font-semibold text-ink-1">{title}</h3>
      {body && (
        <p className="text-[13px] text-ink-3 italic-editorial mt-1.5 max-w-md mx-auto leading-relaxed">
          {body}
        </p>
      )}
      {cta && action && (
        <button
          onClick={action}
          className="mt-5 inline-flex items-center gap-2 h-9 px-4 rounded-md bg-accent text-white text-[13px] font-medium hover:bg-[var(--accent-hover)] transition-colors duration-tab"
        >
          {cta()}
        </button>
      )}
    </div>
  );
}