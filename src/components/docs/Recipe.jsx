import { ChefHat, AlertTriangle } from 'lucide-react';

// One recipe card — a real BMS scenario, ordered steps, and the gotcha to
// avoid. Designed to be skimmable: title in 4 words, "when" in one line,
// numbered steps short enough to read in 10s.
export default function Recipe({ recipe }) {
  return (
    <div id={`recipe-${recipe.id}`} className="border border-line-1 rounded-md bg-surface-1 scroll-mt-24">
      <header className="px-4 py-3 border-b border-line-1 flex items-start gap-3">
        <ChefHat className="w-4 h-4 text-accent shrink-0 mt-0.5" />
        <div className="min-w-0">
          <h3 className="text-[13.5px] font-semibold text-ink-1 leading-tight">{recipe.title}</h3>
          <p className="text-[11.5px] text-ink-3 italic-editorial mt-1">{recipe.when}</p>
        </div>
      </header>
      <div className="px-4 py-3.5 space-y-3">
        <ol className="space-y-1.5 list-decimal ml-5 text-[12.5px] text-ink-2 leading-relaxed">
          {recipe.steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
        {recipe.pitfall && (
          <div className="flex items-start gap-2 bg-warning-soft border-l-2 border-warning rounded-r p-2.5">
            <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0 mt-0.5" />
            <p className="text-[11.5px] text-ink-2 leading-snug">
              <span className="font-medium text-ink-1">Pitfall: </span>{recipe.pitfall}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}