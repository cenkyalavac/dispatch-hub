// Friendly-name helpers — single source of truth for the UI side.
//
// What this is:
//   FriendlyName entities are a human-display sözlük. We map opaque
//   upstream identifiers ("Amazon.com Services, Inc.", project_id 47110)
//   to short, readable labels ("Amazon", "Adloc Shopper").
//
// What this is NOT:
//   FieldMapping — that's the BMS-facing translation table and it returns
//   null on miss to protect downstream systems. Friendly names ALWAYS fall
//   back to the original value (passthrough). The two never share rows.
//
// Resolution order for a given (type, portal, task):
//   1. ID match on portal-specific rule, if the task carries the ID field
//   2. NAME match on portal-specific rule
//   3. ID match on wildcard '*' portal rule
//   4. NAME match on wildcard '*' portal rule
//   5. Original raw name (or '' if missing)

import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

// Which task fields supply the lookup key per friendly type.
// Each type can match by name (always available) OR id (when present).
export const FRIENDLY_FIELDS = {
  client:   { nameField: 'client_name',   idField: null },        // clients have no stable cross-portal id today
  account:  { nameField: 'account_name',  idField: 'account_id' },
  project:  { nameField: 'project_name',  idField: 'project_id' },
  workflow: { nameField: 'workflow_name', idField: null },
};

// In-memory index: { type -> [{ portal, match_by, source_value_lc, display_name }] }
// Sorted so portal-specific rules win over '*' (we iterate; first hit wins).
function buildIndex(rows) {
  const index = {};
  // Stable sort: portal-specific first, then wildcard.
  const sorted = [...rows].sort((a, b) => {
    if (a.portal === b.portal) return 0;
    if (a.portal === '*') return 1;
    if (b.portal === '*') return -1;
    return 0;
  });
  for (const r of sorted) {
    if (r.is_active === false) continue;
    if (!index[r.type]) index[r.type] = [];
    index[r.type].push({
      portal: r.portal,
      match_by: r.match_by || 'name',
      source_value_lc: String(r.source_value || '').toLowerCase(),
      display_name: r.display_name,
    });
  }
  return index;
}

// Resolve a single (type, task) lookup against the index. Pure function.
export function resolveFriendly(index, type, task) {
  if (!index || !task || !type) return '';
  const fields = FRIENDLY_FIELDS[type];
  if (!fields) return '';

  const rawName = task[fields.nameField] != null ? String(task[fields.nameField]) : '';
  const rawId = fields.idField && task[fields.idField] != null ? String(task[fields.idField]) : '';
  const portalKey = task.portal || '';
  const rules = index[type] || [];

  // Try matches in priority order: portal+id, portal+name, *+id, *+name.
  // The index is already sorted portal-specific-first; we still check the
  // match_by within each rule so a portal-specific name rule never overrides
  // an unrelated wildcard id rule.
  for (const r of rules) {
    if (r.portal !== '*' && r.portal !== portalKey) continue;
    if (r.match_by === 'id') {
      if (!rawId) continue;
      if (r.source_value_lc === rawId.toLowerCase()) return r.display_name;
    } else {
      if (!rawName) continue;
      if (r.source_value_lc === rawName.toLowerCase()) return r.display_name;
    }
  }
  // Fall through to raw value — friendly names are passthrough on miss.
  return rawName;
}

// React hook — loads ALL friendly names once per session and exposes helpers.
// Always returns a stable shape so callers can destructure without guards.
export function useFriendlyNames() {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['friendly-names'],
    queryFn: () => base44.entities.FriendlyName.list('-created_date', 2000),
    staleTime: 5 * 60 * 1000,
  });
  const index = buildIndex(rows);

  // friendly(task, type) → short label or fallback to original
  const friendly = (task, type) => resolveFriendly(index, type, task);

  // friendlyTask(task) → shallow-cloned task with friendly_* fields filled in.
  // Useful when handing a task off to a component that doesn't know about the
  // hook (e.g. row renderers).
  const friendlyTask = (task) => {
    if (!task) return task;
    return {
      ...task,
      friendly_client_name:   friendly(task, 'client'),
      friendly_account_name:  friendly(task, 'account'),
      friendly_project_name:  friendly(task, 'project'),
      friendly_workflow_name: friendly(task, 'workflow'),
    };
  };

  return { rows, index, friendly, friendlyTask, isLoading };
}