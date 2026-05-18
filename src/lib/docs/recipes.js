// Recipe data for the Documentation page. Each recipe is a real BMS scenario
// that maps directly onto one or more endpoints. Keep these tightly focused —
// "do X" not "here is everything about X". The Documentation page renders
// these via components/docs/Recipe.jsx.

export const RECIPES = [
  {
    id: 'inbox-poll',
    title: 'Pull the accepted-but-unsynchronized inbox',
    when: 'On every BMS tick (every 30-60s) — fetch projects Dispatch has accepted that the BMS hasn\'t picked up yet.',
    steps: [
      'POST /apiProjectsList with { state: "accepted", limit: 200 }.',
      'For each row, project.id is your acknowledge handle. Persist it.',
      'When the BMS has created its own job for the project, call /apiProjectsAcknowledge with { id }.',
      'Acknowledge flips state → "synchronized" and emits the project.synchronized webhook. Subsequent /apiProjectsList { state: "accepted" } calls will no longer return it.',
    ],
    pitfall: "Don't poll faster than ~30s — list responses are page-capped at 500 and you'll burn rate.",
  },
  {
    id: 'webhook-first',
    title: 'Prefer webhooks over polling',
    when: 'You have a public HTTPS endpoint the BMS can host.',
    steps: [
      'Create a WebhookSubscription on /api with your URL, a random 32-byte secret, and the events [project.accepted, project.updated].',
      'Verify the X-Dispatch-Signature header on every POST using HMAC-SHA256 against the secret.',
      'On project.accepted, store project.id + project.external_id and trigger your downstream job-creation flow.',
      'Call /apiProjectsAcknowledge once your BMS finishes ingestion.',
    ],
    pitfall: 'Reply 2xx within ~5s. Long-running work belongs behind a queue — Dispatch retries on any non-2xx.',
  },
  {
    id: 'attachments',
    title: 'Pull source files into BMS storage',
    when: 'A project lands and your BMS needs the handoff materials immediately.',
    steps: [
      'POST /apiAttachmentsList with { project_id }. Returns the catalog with kind="handoff" / "reference" / "delivery".',
      'For each attachment, POST /apiAttachmentsDownload with { attachment_id } to get a ~4-hour signed Dropbox URL.',
      'Stream the file into your storage. The signed URL has no auth — keep it private.',
    ],
    pitfall: 'Symfonie carries handoff files today; Junction and GlobalLink leave attachments_count = 0. Always check the count before iterating.',
  },
  {
    id: 'wwc-billing',
    title: 'Invoice using weighted word count',
    when: 'Your BMS bills per WWC (most agencies do).',
    steps: [
      'Read cat_analysis.weighted_wc directly. This is the source of truth.',
      'For Symfonie, it reflects the end-customer\'s actual per-band grid (Amazon, Adloc, Apple all differ) — never re-derive from bands.',
      'For Junction MTPE projects, mt_weight_coefficient (default 0.70) is already baked into weighted_wc — no need to apply it again.',
      'Pair with vendor_payment.usd_price (when present) for vendor-side reconciliation: weighted_wc × vendor_payment.usd_unit_cost ≈ vendor_payment.usd_price.',
    ],
    pitfall: 'cat_analysis may be null on older projects or portals without CAT capture. Treat null as "no leverage data" — fall back to word_count × default rate.',
  },
  {
    id: 'end-client',
    title: 'Route by end-client / division',
    when: 'You have multiple agency relationships under one Dispatch portal (e.g. Welocalize-Junction-TikTok vs. Welocalize-Junction-Apple).',
    steps: [
      'Always read project.client (Dispatch\'s Client entity — slug-stable, e.g. "apple-inc"). This is the canonical end-customer attribution.',
      'When project.client is null, fall back to project.friendly.account_name + project.raw.account_id for portal-level grouping.',
      'For GlobalLink, raw.account_id (paClientTicket) is stable across submissions for the same end-client — safe to key on.',
      'For Symfonie, raw.account_id is the Symfonie Project.Id (per-project, not per-customer) — use friendly.client_name or the FriendlyName rumuz instead.',
    ],
    pitfall: 'Never key on display strings (project_name, client_name) — they\'re free-text and change without notice. Use IDs and slugs.',
  },
  {
    id: 'mapping',
    title: 'Translate portal values into BMS vocabulary',
    when: 'Your BMS has its own controlled list (e.g. "post_edit") but the portal emits free-text ("MTPE-light").',
    steps: [
      'Set up FieldMapping rows on the /mappings page: { portal, field, source_value, destination_value }.',
      'POST /apiProjectsGet with { id }. project.destination[field] is null-on-miss — only filled when a mapping translated it.',
      'project.mapping_applied lists every translation that fired, useful for debugging.',
      'project.unmapped lists every source value that has no mapping yet — your BMS should refuse to import (or flag for review) rather than guessing.',
    ],
    pitfall: 'apiProjectsList does not include the destination block — it\'s detail-only. Use Get for the BMS ingestion step.',
  },
  {
    id: 'failed-sync',
    title: 'Recover from BMS ingestion failures',
    when: 'Your BMS rejected a project (validation error, schema mismatch) and you want Dispatch to surface it for human triage.',
    steps: [
      'Do NOT call /apiProjectsAcknowledge — leave the project in state="accepted".',
      'POST a state="failed_to_sync" transition is automatic: if the BMS records the failure (any 4xx response from your acknowledge proxy), Dispatch parks the project there.',
      'Operators see failed_to_sync projects on the Dashboard\'s "Action needed" panel and can reset via /projectResetSync.',
    ],
    pitfall: 'Once reset, the project goes back to "accepted" — your BMS will see it again on the next /apiProjectsList poll. Make sure the underlying issue is fixed.',
  },
];