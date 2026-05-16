// Pure helpers used by the Mappings editor to surface data-health issues.
// Kept dependency-free so it can be unit-tested or reused on a future
// analytics page without dragging UI code along.

/**
 * Detect overlapping mappings — same (portal, field, source_value) declared
 * twice. The resolver picks the first match, so duplicates silently shadow
 * each other. We want operators to see them.
 *
 * Returns a Set of mapping ids that participate in a conflict.
 */
export function findConflictIds(mappings) {
  const buckets = new Map(); // key -> [id]
  for (const m of mappings) {
    if (!m.is_active) continue;
    const key = `${m.portal}|${m.field}|${(m.source_value || '').toLowerCase()}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(m.id);
  }
  const ids = new Set();
  for (const arr of buckets.values()) {
    if (arr.length > 1) for (const id of arr) ids.add(id);
  }
  return ids;
}

/**
 * A mapping is "identity" when its destination equals its source — i.e. it's
 * structurally a no-op. Usually the side effect of accepting a suggestion
 * without editing the destination.
 */
export function isIdentityMapping(m) {
  if (!m?.source_value || !m?.destination_value) return false;
  return m.source_value.trim().toLowerCase() === m.destination_value.trim().toLowerCase();
}

/**
 * Group mappings by their `field` so the editor can render one section per
 * shape of data. Preserves the order in FIELD_ORDER, then any unknown fields.
 */
export function groupByField(mappings, FIELD_ORDER) {
  const groups = new Map();
  for (const f of FIELD_ORDER) groups.set(f, []);
  for (const m of mappings) {
    if (!groups.has(m.field)) groups.set(m.field, []);
    groups.get(m.field).push(m);
  }
  // Drop empty groups so we don't render section headers with zero rows.
  return [...groups.entries()].filter(([, rows]) => rows.length > 0);
}