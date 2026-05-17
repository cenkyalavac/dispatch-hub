// Minimal API spec endpoint — describes the BMS Integration API in JSON form.
// Public (no auth) so integrators can discover endpoints.
Deno.serve(async () => {
  const spec = {
    name: 'Dispatch Hub — BMS Integration API',
    version: '2.1.0-faz2',
    auth: {
      scheme: 'Apikey',
      header: 'Authorization: Apikey <token>',
      bearer_accepted: true,
    },
    states: ['accepted', 'synchronized', 'delivered', 'failed_to_sync'],
    endpoints: [
      {
        name: 'List projects',
        function: 'apiProjectsList',
        scope: 'read:projects',
        body: {
          state: 'accepted | synchronized | delivered | failed_to_sync',
          limit: 'number (<=500)',
          client_id: 'string (optional) — filter by Client.id',
          client_slug: 'string (optional) — filter by Client.slug (e.g. "apple-inc")',
        },
        returns: '{ count, projects: [{ ..., client, friendly, raw, cat_analysis }] }',
        notes: 'Each project carries `friendly` (passthrough rumuz overlay), `raw` (upstream account/project/workflow identifiers), and `cat_analysis` (leverage bands + weighted_wc; null when no CAT data was captured).',
      },
      {
        name: 'Get project',
        function: 'apiProjectsGet',
        scope: 'read:projects',
        body: { id: 'string' },
        returns: '{ project: { origin, destination, friendly, mapping_applied, attachments_count, cat_analysis } }',
        notes: 'destination is null-on-miss (BMS safety). friendly is passthrough — short rumuz when one exists, else raw upstream name. cat_analysis exposes the same leverage breakdown as apiProjectsList.',
      },
      {
        name: 'Acknowledge project',
        function: 'apiProjectsAcknowledge',
        scope: 'write:projects',
        body: { id: 'string' },
        effect: 'state: accepted -> synchronized; emits project.synchronized webhook',
      },
      {
        name: 'Deliver project',
        function: 'apiProjectsDeliver',
        scope: 'write:projects',
        body: { id: 'string' },
        effect: 'state: synchronized -> delivered; emits project.delivered webhook',
      },
      {
        name: 'List field mappings',
        function: 'apiMappingsList',
        scope: 'read:projects',
        body: { portal: 'string (optional)', field: 'string (optional)' },
        returns: '{ count, mappings: [] }',
      },
      {
        name: 'List project attachments',
        function: 'apiAttachmentsList',
        scope: 'read:projects',
        body: { project_id: 'string' },
        returns: '{ count, attachments: [{ id, name, size, storage_path, ... }] }',
      },
      {
        name: 'Get attachment download URL',
        function: 'apiAttachmentsDownload',
        scope: 'read:projects',
        body: { attachment_id: 'string' },
        returns: '{ url: string, expires_in_seconds: 14400 }',
      },
    ],
    webhooks: {
      events: ['project.accepted', 'project.synchronized', 'project.delivered', 'project.failed_to_sync'],
      signing: 'X-Dispatch-Signature: sha256=<HMAC of raw body using subscription.secret>',
      delivery_log: 'WebhookDelivery entity',
    },
    mapping: {
      entity: 'FieldMapping',
      fields: ['source_language', 'target_language', 'client_name', 'workflow_name', 'service_tag'],
      match: 'case-insensitive on source_value; null-on-miss (BMS safety)',
      portal_scope: 'specific portal key, or "*" for any',
    },
    friendly_names: {
      entity: 'FriendlyName',
      types: ['client', 'account', 'project', 'workflow'],
      match_by: ['name (case-insensitive)', 'id (exact)'],
      behaviour: 'passthrough — falls back to raw upstream name if no rumuz matches',
      surfaces: ['UI (pending, dashboard, history)', 'notification emails', 'Google Sheets (friendly_* source fields)', 'BMS API (project.friendly block)'],
    },
    cat_analysis: {
      surfaces: ['apiProjectsList.projects[].cat_analysis', 'apiProjectsGet.project.cat_analysis'],
      shape: {
        weighted_wc: 'number — source-of-truth weighted word count (Junction precomputed; Symfonie/GlobalLink computed via MTPE-aligned formula)',
        parser_type: 'string|null — CAT tool that produced the analysis (MemSource, Junction, ...)',
        bands: {
          context: 'in-context / context-TM matches',
          rep: 'pure cross-segment repetitions',
          match100: '100% matches',
          fuzzy_95_99: 'pure 95-99% fuzzy (Reps95-99 live in rep_95_99)',
          fuzzy_85_94: 'pure 85-94% fuzzy',
          fuzzy_75_84: 'pure 75-84% fuzzy',
          fuzzy_50_74: 'pure 50-74% fuzzy',
          rep_95_99: 'GlobalLink-only: repetitions inside the 95-99 fuzzy band',
          rep_85_94: 'GlobalLink-only',
          rep_75_84: 'GlobalLink-only',
          rep_50_74: 'GlobalLink-only',
          no_match: 'no-match words (Junction folds mtPostEdit into this bucket)',
        },
      },
      notes: 'cat_analysis is null when no CAT data was captured at accept time (older rows or portals without analysis). Junction has no 50-74 band (lowest is 75). GlobalLink emits sub-bands (rep_XX_XX); Symfonie/Junction leave them at 0.',
    },
    notes: [
      'Faz 2: destination is computed via FieldMapping rules; mapping_applied lists every translation that fired.',
      'Faz 2: ProjectAttachment catalog tracks Dropbox-uploaded handoff files; BMS can list & download via signed URLs (~4h validity).',
      'Faz 2.1: cat_analysis surfaces the leverage breakdown + weighted_wc on every project payload (list and detail).',
      'Multi-tenant ready: every record is scoped by tenant_id. Default tenant is "default".',
    ],
  };
  return Response.json(spec);
});