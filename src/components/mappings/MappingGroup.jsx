import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import MappingRow from './MappingRow';

const FIELD_LABEL = {
  source_language: 'Source language',
  target_language: 'Target language',
  client_name:     'Client name',
  workflow_name:   'Workflow',
  service_tag:     'Service tag',
};

const FIELD_HINT = {
  source_language: 'How portal source-locale codes (e.g. en-US) map to the BMS locale.',
  target_language: 'How portal target-locale codes map to the BMS locale.',
  client_name:     'How portal client display names map to the BMS client identifier.',
  workflow_name:   'How portal workflow names map to the BMS workflow tag.',
  service_tag:     'Free-form service tag mapping (used for BMS service categorization).',
};

/**
 * One collapsible group on the Mappings editor — all rules for a single
 * `field`. Defaults to expanded; the user can collapse fields they aren't
 * working on so the view stays focused.
 */
export default function MappingGroup({ field, mappings, conflictIds, ...rowHandlers }) {
  const [open, setOpen] = useState(true);
  const conflictsInGroup = mappings.filter(m => conflictIds.has(m.id)).length;

  return (
    <section className="mb-4">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 mb-2 group"
      >
        {open
          ? <ChevronDown className="w-3.5 h-3.5 text-ink-3" />
          : <ChevronRight className="w-3.5 h-3.5 text-ink-3" />}
        <h3 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-2">
          {FIELD_LABEL[field] || field}
        </h3>
        <span className="text-[11px] text-ink-3 tabular-nums">{mappings.length}</span>
        {conflictsInGroup > 0 && (
          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider bg-warning-soft text-warning px-1.5 py-0.5 rounded">
            {conflictsInGroup} conflict{conflictsInGroup === 1 ? '' : 's'}
          </span>
        )}
        <span className="text-[11px] text-ink-3 italic-editorial ml-2 truncate group-hover:text-ink-2 transition-colors duration-tab">
          {FIELD_HINT[field] || ''}
        </span>
      </button>
      {open && (
        <div className="space-y-2">
          {mappings.map(m => (
            <MappingRow
              key={m.id}
              mapping={m}
              hasConflict={conflictIds.has(m.id)}
              {...rowHandlers}
            />
          ))}
        </div>
      )}
    </section>
  );
}