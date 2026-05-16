import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

// One card on the Settings hub page. Tile-shaped link with an icon, title,
// and a one-line italic-editorial description. Used for every settings entry
// point so the hub reads as a uniform index.
export default function SettingsCard({ to, icon: Icon, title, body }) {
  return (
    <Link
      to={to}
      className="group bg-surface-1 border border-line-1 rounded-md p-4 hover:bg-surface-2 transition-colors duration-tab"
    >
      <div className="flex items-start gap-3">
        <span className="w-8 h-8 rounded-md bg-accent-soft text-accent-ink flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-semibold text-ink-1">{title}</p>
            <ArrowRight className="w-3.5 h-3.5 text-ink-3 group-hover:text-ink-1 group-hover:translate-x-0.5 transition-all duration-tab" />
          </div>
          <p className="text-[12px] text-ink-3 italic-editorial mt-0.5 leading-relaxed">{body}</p>
        </div>
      </div>
    </Link>
  );
}