export default function FormField({ label, hint, error, children, className = '' }) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && (
        <label className="text-[11px] uppercase tracking-wider font-medium text-ink-3">
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-[11px] text-danger">{error}</p>
      ) : hint ? (
        <p className="text-[11px] text-ink-3 italic-editorial">{hint}</p>
      ) : null}
    </div>
  );
}