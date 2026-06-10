export default function FormField({ label, hint = null, helper = null, error = null, required = false, htmlFor = undefined, children, className = '' }) {
  // `helper` and `hint` are aliases — both render the same secondary line.
  const secondary = error || hint || helper;
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && (
        <label htmlFor={htmlFor} className="text-[11px] uppercase tracking-wider font-medium text-ink-3">
          {label}
          {required && <span className="text-danger ml-1" aria-hidden>*</span>}
        </label>
      )}
      {children}
      {secondary ? (
        <p className={`text-[11px] ${error ? 'text-danger' : 'text-ink-3 italic-editorial'}`}>{secondary}</p>
      ) : null}
    </div>
  );
}