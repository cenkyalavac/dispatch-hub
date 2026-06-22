import { Check, ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { VENDOR_OPTIONS, VENDOR_LABELS } from '@/lib/worldserver';

// Multi-select vendor filter using the friendly labels. Empty selection = all.
export default function VendorFilter({ selected, onChange }) {
  const toggle = (slug) => {
    onChange(selected.includes(slug) ? selected.filter((s) => s !== slug) : [...selected, slug]);
  };

  const label = selected.length === 0
    ? 'All vendors'
    : selected.length === 1
      ? VENDOR_LABELS[selected[0]]
      : `${selected.length} vendors`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="field-control inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-line-1 bg-surface-1 text-[13px] text-ink-1 outline-none">
          {label}
          <ChevronDown className="w-3 h-3 opacity-70" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[200px]">
        {VENDOR_OPTIONS.map((slug) => {
          const on = selected.includes(slug);
          return (
            <DropdownMenuItem
              key={slug}
              onSelect={(e) => { e.preventDefault(); toggle(slug); }}
              className="flex items-center gap-2 cursor-pointer"
            >
              <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${on ? 'bg-accent border-accent' : 'border-line-2'}`}>
                {on && <Check className="w-2.5 h-2.5 text-white" />}
              </span>
              {VENDOR_LABELS[slug]}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}