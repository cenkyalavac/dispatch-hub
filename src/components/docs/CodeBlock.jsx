import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

// Minimal, monospaced code block with a copy button. Used throughout the
// Documentation page for curl examples, JSON payload shapes, etc.
export default function CodeBlock({ children, language = 'bash' }) {
  const [copied, setCopied] = useState(false);
  const text = typeof children === 'string' ? children : String(children ?? '');

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch { /* clipboard blocked — silently no-op */ }
  };

  return (
    <div className="relative group">
      <pre className="bg-[oklch(0.18_0.02_260)] text-[oklch(0.92_0.01_260)] rounded-md p-3.5 text-[12px] font-mono leading-relaxed overflow-x-auto">
        <code data-lang={language}>{text}</code>
      </pre>
      <button
        type="button"
        onClick={onCopy}
        className="absolute top-2 right-2 h-7 w-7 inline-flex items-center justify-center rounded bg-[oklch(0.25_0.02_260)] text-[oklch(0.85_0.01_260)] opacity-0 group-hover:opacity-100 transition-opacity duration-tab hover:bg-[oklch(0.30_0.02_260)]"
        aria-label="Copy code"
      >
        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}