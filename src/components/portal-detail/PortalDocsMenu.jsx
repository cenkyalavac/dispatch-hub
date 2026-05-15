import { BookOpen, ExternalLink } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getDocsForPortal } from '@/lib/portal-docs';

// Dropdown that exposes the provider's official API documentation, with
// deep-links to the most relevant sections (auth, tasks, webhooks, ...).
// Renders nothing when no docs are configured — keeps the header clean.
export default function PortalDocsMenu({ portal }) {
  const docs = getDocsForPortal(portal);
  if (!docs) return null;

  const { home, sections = [] } = docs;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-line-1 bg-surface-1 text-[12px] text-ink-2 hover:bg-surface-2 hover:text-ink-1 transition-colors duration-tab"
          title="Open API documentation"
        >
          <BookOpen className="w-3.5 h-3.5" />
          Docs
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-ink-3 font-normal">
          {portal.name} API
        </DropdownMenuLabel>
        {home && (
          <DropdownMenuItem asChild>
            <a
              href={home}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between gap-2 text-[12px] cursor-pointer"
            >
              <span>Documentation home</span>
              <ExternalLink className="w-3 h-3 text-ink-3" />
            </a>
          </DropdownMenuItem>
        )}
        {sections.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-ink-3 font-normal">
              Sections
            </DropdownMenuLabel>
            {sections.map((s) => (
              <DropdownMenuItem key={s.url} asChild>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between gap-2 text-[12px] cursor-pointer"
                >
                  <span>{s.label}</span>
                  <ExternalLink className="w-3 h-3 text-ink-3" />
                </a>
              </DropdownMenuItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}