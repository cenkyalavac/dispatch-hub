// Surfaces values seen in real projects that aren't yet covered by FieldMapping rules.
// Reads from the Project entity (everything that's flowed through the hub) and groups
// distinct values per (portal, field) pair. Returns top-N suggestions ranked by frequency.
//
// No writes — pure read endpoint. Frontend posts one suggestion at a time to FieldMapping.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Which Project fields map to which FieldMapping field names.
// Project doesn't carry workflow_name / service_tag directly, so we only suggest the three
// fields that have real coverage in the entity.
const FIELD_SOURCES = [
  { mappingField: 'source_language', projectField: 'source_language' },
  { mappingField: 'target_language', projectField: 'target_language' },
  { mappingField: 'client_name',     projectField: 'client_name' },
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // 1. Load existing mappings — key by (portal|field|lowercased source_value).
    const mappings = await base44.asServiceRole.entities.FieldMapping.list('-created_date', 2000);
    const mapped = new Set();
    for (const m of mappings) {
      const portals = m.portal === '*' ? ['*'] : [m.portal];
      for (const p of portals) {
        mapped.add(`${p}|${m.field}|${(m.source_value || '').toLowerCase()}`);
      }
    }

    // 2. Sweep recent projects — frequency per (portal, field, value).
    const projects = await base44.asServiceRole.entities.Project.list('-accepted_at', 1000);
    const counter = new Map(); // key -> { portal, field, value, count, exampleProject }
    for (const proj of projects) {
      for (const { mappingField, projectField } of FIELD_SOURCES) {
        const raw = proj[projectField];
        if (!raw || typeof raw !== 'string') continue;
        const value = raw.trim();
        if (!value) continue;
        const portalKey = proj.portal || '*';
        const dedupeKey = `${portalKey}|${mappingField}|${value.toLowerCase()}`;
        // Skip if already covered (either portal-specific or wildcard).
        if (mapped.has(dedupeKey)) continue;
        if (mapped.has(`*|${mappingField}|${value.toLowerCase()}`)) continue;

        const existing = counter.get(dedupeKey);
        if (existing) {
          existing.count++;
        } else {
          counter.set(dedupeKey, {
            portal: portalKey,
            field: mappingField,
            value,
            count: 1,
            example_project: proj.name || proj.project_name || '',
          });
        }
      }
    }

    // 3. Rank by frequency desc; cap at 50 suggestions.
    const suggestions = [...counter.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 50);

    return Response.json({
      success: true,
      scanned_projects: projects.length,
      existing_mappings: mappings.length,
      suggestions,
    });
  } catch (error) {
    console.error('suggestMappings error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});