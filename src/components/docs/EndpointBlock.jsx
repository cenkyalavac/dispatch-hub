import CodeBlock from './CodeBlock';

// One endpoint = one card: title, scope chip, short description, request body
// shape, sample response, and a copyable curl. Kept small so individual
// endpoint docs stay readable and self-contained.
const SCOPE_COLOR = {
  'read:projects':  'bg-accent-soft text-accent-ink',
  'write:projects': 'bg-warning-soft text-[oklch(0.45_0.16_75)]',
  'public':         'bg-surface-2 text-ink-3',
};

export default function EndpointBlock({
  fn,
  scope = 'read:projects',
  title = null,
  description = null,
  body = null,
  response = null,
  curl = null,
  notes = null,
}) {
  return (
    <div className="border border-line-1 rounded-md bg-surface-1 overflow-hidden">
      <header className="px-4 py-3 border-b border-line-1 flex items-center gap-3 flex-wrap">
        <code className="font-mono text-[13px] text-ink-1 font-medium">{fn}</code>
        <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${SCOPE_COLOR[scope] || SCOPE_COLOR.public}`}>
          {scope}
        </span>
        {title && <span className="text-[12px] text-ink-3 italic-editorial">— {title}</span>}
      </header>

      <div className="px-4 py-3.5 space-y-3.5">
        {description && (
          <p className="text-[12.5px] text-ink-2 leading-relaxed">{description}</p>
        )}

        {body && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-ink-3 mb-1">Request body</p>
            <CodeBlock language="json">{body}</CodeBlock>
          </div>
        )}

        {response && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-ink-3 mb-1">Response</p>
            <CodeBlock language="json">{response}</CodeBlock>
          </div>
        )}

        {curl && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-ink-3 mb-1">Example</p>
            <CodeBlock language="bash">{curl}</CodeBlock>
          </div>
        )}

        {notes && (
          <p className="text-[11.5px] text-ink-3 italic-editorial border-l-2 border-line-2 pl-3">
            {notes}
          </p>
        )}
      </div>
    </div>
  );
}