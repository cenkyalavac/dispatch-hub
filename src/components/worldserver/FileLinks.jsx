import { Download } from 'lucide-react';

// Compact source/target Dropbox links. Never renders a raw URL; opens in a new
// tab. Renders nothing for an absent link.
function FileLink({ url, label }) {
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-1 h-6 px-1.5 rounded text-[11px] text-ink-3 hover:text-accent-ink hover:bg-accent-soft transition-colors duration-tab"
      title={`Open ${label} WSXZ in Dropbox`}
    >
      <Download className="w-3 h-3" /> {label}
    </a>
  );
}

export default function FileLinks({ sourceUrl, targetUrl }) {
  return (
    <div className="flex items-center gap-1">
      <FileLink url={sourceUrl} label="Source" />
      <FileLink url={targetUrl} label="Target" />
    </div>
  );
}