// Minimal API spec endpoint — describes the BMS Integration API in JSON form.
// Public (no auth) so integrators can discover endpoints.
Deno.serve(async () => {
  const spec = {
    name: 'Dispatch Hub — BMS Integration API',
    version: '2.0.0-faz2',
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
        body: { state: 'accepted | synchronized | delivered | failed_to_sync', limit: 'number (<=500)' },
        returns: '{ count, projects: [] }',
      },
      {
        name: 'Get project',
        function: 'apiProjectsGet',
        scope: 'read:projects',
        body: { id: 'string' },
        returns: '{ project: { origin, destination, friendly, mapping_applied, attachments_count } }',
        notes: 'destination is null-on-miss (BMS safety). friendly is passthrough — short rumuz when one exists, else raw upstream name.',
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
    notes: [
      'Faz 2: destination is computed via FieldMapping rules; mapping_applied lists every translation that fired.',
      'Faz 2: ProjectAttachment catalog tracks Dropbox-uploaded handoff files; BMS can list & download via signed URLs (~4h validity).',
      'Multi-tenant ready: every record is scoped by tenant_id. Default tenant is "default".',
    ],
  };
  return Response.json(spec);
});