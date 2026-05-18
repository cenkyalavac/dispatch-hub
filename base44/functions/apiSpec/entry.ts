// Minimal API spec endpoint — describes the BMS Integration API in JSON form.
// Public (no auth) so integrators can discover endpoints.
Deno.serve(async () => {
  const spec = {
    name: 'Dispatch Hub — BMS Integration API',
    version: '2.3.0-vendor',
    // Contract stability policy — Dispatch's adapter is pinned to v2.x and
    // uses these fields to decide whether to parse safely or alert ops.
    // Read on adapter boot; treat as the canonical guard input.
    stability: 'stable',
    supported_majors: [2],
    policy: {
      additive_changes:
        'New optional fields, new webhook events, and new optional body params ship under the same major version without notice. Adapters MUST ignore unknown fields rather than error on them.',
      breaking_changes:
        'Renames, removals, retypes, or restructures bump the major version (v2.x → v3.x). We commit to a minimum 30-day parallel window where v2 endpoints remain live, and to publishing a v2→v3 migration diff before cutover.',
      guard_recommendation: {
        accept_major: 2,
        warn_on_minor_or_patch_drift: true,
        reject_major_above: 2,
        notes:
          'Pin your adapter to major === 2. Warn (don\'t reject) when minor/patch drift from your tested version, log the diff, keep parsing. Reject and alert ops when major !== 2 — refuse to parse rather than mis-parse silently.',
      },
      version_source_of_truth: 'GET /functions/apiSpec (public, no auth) → .version',
    },
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
        returns: '{ count, projects: [{ ..., client, friendly, raw, cat_analysis, vendor_payment, project_notes }] }',
        notes: 'Each project carries `friendly` (passthrough rumuz overlay), `raw` (upstream account/project/workflow identifiers), `cat_analysis` (leverage bands + weighted_wc; null when no CAT data was captured), `vendor_payment` (what the portal owes us — null when no PO is attached), and `project_notes` (free-text project brief — empty when none).',
      },
      {
        name: 'Get project',
        function: 'apiProjectsGet',
        scope: 'read:projects',
        body: { id: 'string' },
        returns: '{ project: { origin, destination, friendly, mapping_applied, attachments_count, cat_analysis, vendor_payment, project_notes } }',
        notes: 'destination is null-on-miss (BMS safety). friendly is passthrough — short rumuz when one exists, else raw upstream name. cat_analysis exposes the same leverage breakdown as apiProjectsList. vendor_payment / project_notes mirror the list shape.',
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
        weighted_wc: 'number — source-of-truth weighted word count. Junction: precomputed upstream. Symfonie: native CalculatedQuantity (customer\'s actual per-band grid — Amazon vs. Adloc vs. Apple all differ); falls back to MTPE-aligned formula only when Symfonie didn\'t emit a value. GlobalLink: computed via MTPE-aligned formula.',
        parser_type: 'string|null — CAT tool that produced the analysis (MemSource, Junction, ...)',
        mt_weight_coefficient: 'number|null — WWC multiplier for mt_post_edit band (0.0-1.0). Junction TikTok program default = 0.70 (regression-validated, 5 tasks, 0% fit error). null for tasks without an MTPE band (Symfonie/GlobalLink today). Per-account override path is open via AcceptedTask.mt_weight_coefficient.',
        bands: {
          context: 'in-context / context-TM matches',
          rep: 'pure cross-segment repetitions',
          match100: '100% matches',
          fuzzy_95_99: 'pure 95-99% fuzzy (Reps95-99 live in rep_95_99)',
          fuzzy_85_94: 'pure 85-94% fuzzy',
          fuzzy_75_84: 'pure 75-84% fuzzy',
          fuzzy_50_74: 'pure 50-74% fuzzy (Junction has no band below 75)',
          rep_95_99: 'GlobalLink-only: repetitions inside the 95-99 fuzzy band',
          rep_85_94: 'GlobalLink-only',
          rep_75_84: 'GlobalLink-only',
          rep_50_74: 'GlobalLink-only',
          mt_post_edit: 'Junction-only today: machine-translation post-edit words. WWC contribution = words * mt_weight_coefficient. GlobalLink PD does not emit this band; Symfonie does not produce MTPE analyses.',
          no_match: 'no-match (new) words. Junction surfaces this as PURE newWords — mtPostEdit is split into its own band above.',
        },
      },
      notes: 'cat_analysis is null when no CAT data was captured at accept time (older rows or portals without analysis). Junction has no 50-74 band (lowest is 75). GlobalLink emits sub-bands (rep_XX_XX); Symfonie/Junction leave them at 0. Junction TikTok program regression confirms WWC = 100%*0.10 + 95-99*0.30 + 85-94*0.40 + 75-84*0.50 + mt_post_edit*0.70 + no_match*1.00 (ICE/Rep zero-weighted).',
    },
    vendor_payment: {
      surfaces: ['apiProjectsList.projects[].vendor_payment', 'apiProjectsGet.project.vendor_payment'],
      description: 'Vendor-side financial breakdown — i.e. what the originating portal owes us. We are the vendor, so partner_name identifies the entity paying us (Moravia, Welocalize, TransPerfect, etc.).',
      shape: {
        partner_id: 'number|null — portal-internal partner ID',
        partner_code: 'string — short partner code (often empty)',
        partner_name: 'string — display name of the paying entity',
        currency: 'string — vendor settlement currency (e.g. "EUR", "USD")',
        unit_cost: 'number — per-word unit rate in partner_currency',
        partner_price: 'number — total in partner_currency',
        usd_unit_cost: 'number — per-word unit rate in USD (for cross-currency comparison)',
        usd_price: 'number — total in USD (use this for invoicing in USD)',
      },
      notes: 'Symfonie source: PurchaseOrder.Prices (most-recent PO, first Price row). Null when no PO is attached at accept time. GlobalLink / Junction do not surface vendor-payment today — stays null.',
    },
    project_notes: {
      surfaces: ['apiProjectsList.projects[].project_notes', 'apiProjectsGet.project.project_notes'],
      description: 'Free-text project-level brief from the originating portal. BMS-facing — Dispatch reads it to brief PMs.',
      notes: 'Symfonie source: Project.Notes (project-level, not task-level). Empty string when the portal didn\'t attach one. GlobalLink / Junction not wired yet — stays empty.',
    },
    notes: [
      'Faz 2: destination is computed via FieldMapping rules; mapping_applied lists every translation that fired.',
      'Faz 2: ProjectAttachment catalog tracks Dropbox-uploaded handoff files; BMS can list & download via signed URLs (~4h validity).',
      'Faz 2.1: cat_analysis surfaces the leverage breakdown + weighted_wc on every project payload (list and detail).',
      'Faz 2.2: Junction MTPE — tasks may carry mt_post_edit (machine-translation post-edit words). WWC formula includes this band with a portal-specific weight (Junction default = 0.70). Other portals (GlobalLink, Symfonie) typically have mt_post_edit = 0.',
      'Faz 2.3: Symfonie WWC source-of-truth shifted to CalculatedQuantity (customer\'s real per-band grid). The generic 0.2/0.35/0.45/0.6 formula remains only as a fallback when Symfonie didn\'t emit a calculated value. vendor_payment + project_notes added to project payloads.',
      'Multi-tenant ready: every record is scoped by tenant_id. Default tenant is "default".',
    ],
  };
  return Response.json(spec);
});