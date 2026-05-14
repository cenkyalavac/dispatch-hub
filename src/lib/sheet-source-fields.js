// Catalogue of source fields available for Google-Sheets column mapping.
// We merge the standard AcceptedTask fields with whatever portal-specific
// rule_fields the user has defined on the Portal record. Anything that exists
// on the AcceptedTask row at sync time can be mapped to a sheet column.

export const STANDARD_FIELDS = [
  { name: 'task_id',         label: 'Task ID' },
  { name: 'task_name',       label: 'Task name' },
  { name: 'project_name',    label: 'Project name' },
  { name: 'client_name',     label: 'Client / account' },
  { name: 'source_language', label: 'Source language' },
  { name: 'target_language', label: 'Target language' },
  { name: 'word_count',      label: 'Word count' },
  { name: 'price',           label: 'Price' },
  { name: 'due_date',        label: 'Due date' },
  { name: 'accepted_at',     label: 'Accepted at' },
  { name: 'matched_rule',    label: 'Matched rule' },
  { name: 'portal',          label: 'Portal' },
  { name: 'status',          label: 'Status' },
];

// Returns the full picker list for a given portal — standard + that portal's
// rule_fields (de-duped by name; rule_fields keep their custom label).
export function getSourceFieldsForPortal(portal) {
  const out = [...STANDARD_FIELDS];
  const seen = new Set(out.map((f) => f.name));
  for (const rf of portal?.rule_fields || []) {
    if (!rf?.name || seen.has(rf.name)) continue;
    out.push({ name: rf.name, label: rf.label || rf.name });
    seen.add(rf.name);
  }
  return out;
}