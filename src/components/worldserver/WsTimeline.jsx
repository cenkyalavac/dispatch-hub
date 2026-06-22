import { Check, Circle } from 'lucide-react';
import { parseWsDate } from '@/lib/worldserver';

// New → In translation → Delivered, with timestamps where known.
const STEPS = [
  { key: 'new', label: 'New' },
  { key: 'in_translate', label: 'In translation' },
  { key: 'delivered', label: 'Delivered' },
];
const ORDER = { new: 0, in_translate: 1, delivered: 2 };

export default function WsTimeline({ project }) {
  const current = ORDER[project.status] ?? 0;
  const stamps = {
    new: parseWsDate(project.creationDate),
    delivered: parseWsDate(project.deliveredAt),
  };

  return (
    <ol className="space-y-3">
      {STEPS.map((step, i) => {
        const done = i < current;
        const active = i === current;
        const stamp = stamps[step.key];
        return (
          <li key={step.key} className="flex items-center gap-3">
            <span className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0
              ${done ? 'bg-success text-white' : active ? 'bg-accent text-white' : 'bg-surface-2 text-ink-4'}`}>
              {done ? <Check className="w-3 h-3" /> : <Circle className="w-2 h-2 fill-current" />}
            </span>
            <span className={`text-[13px] ${active || done ? 'text-ink-1 font-medium' : 'text-ink-3'}`}>{step.label}</span>
            {stamp && (
              <span className="ml-auto text-[11px] text-ink-3 tabular-nums" title={stamp.toLocaleString()}>
                {stamp.toLocaleDateString()}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}