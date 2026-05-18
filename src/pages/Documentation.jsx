import { BookOpen } from 'lucide-react';
import DocSection from '@/components/docs/DocSection';
import EndpointBlock from '@/components/docs/EndpointBlock';
import CodeBlock from '@/components/docs/CodeBlock';
import DocTOC from '@/components/docs/DocTOC';
import PortalMatrix from '@/components/docs/PortalMatrix';
import Recipe from '@/components/docs/Recipe';
import FieldTable from '@/components/docs/FieldTable';
import { PORTAL_MATRIX, PORTAL_COLUMNS } from '@/lib/docs/portal-matrix';
import { RECIPES } from '@/lib/docs/recipes';

// Living reference for the Dispatch Hub BMS Integration API. Goal: a BMS
// engineer should land here and within ~10 minutes know exactly what to
// call, what the payload means, and what's portal-specific.
const TOC = [
  { id: 'overview',         label: 'Overview' },
  { id: 'quickstart',       label: 'Quickstart' },
  { id: 'lifecycle',        label: 'Project lifecycle' },
  { id: 'portal-matrix',    label: 'Portal capabilities' },
  { id: 'auth',             label: 'Authentication' },
  { id: 'keys',             label: 'API keys' },
  { id: 'endpoints',        label: 'Endpoints' },
  { id: 'project-payload',  label: 'Project payload anatomy' },
  { id: 'cat-analysis',     label: 'CAT analysis block' },
  { id: 'vendor-payment',   label: 'Vendor payment block' },
  { id: 'project-notes',    label: 'Project notes' },
  { id: 'friendly-raw',     label: 'friendly vs raw vs destination' },
  { id: 'recipes',          label: 'Recipes' },
  { id: 'webhooks',         label: 'Webhooks' },
  { id: 'webhook-events',   label: 'Event catalog' },
  { id: 'webhook-payload',  label: 'Webhook payload' },
  { id: 'webhook-security', label: 'Signature verification' },
  { id: 'webhook-retries',  label: 'Retries & failures' },
  { id: 'errors',           label: 'Errors' },
  { id: 'spec',             label: 'Machine-readable spec' },
];

const ENDPOINTS = [
  {
    fn: 'apiProjectsList',
    scope: 'read:projects',
    title: 'List projects by lifecycle state',
    description:
      'Pulls projects scoped to your tenant. Default state is "accepted" — i.e. the inbox the BMS still needs to acknowledge. Optional client_id / client_slug filters scope the result to a single end-customer. Page-capped at 500 rows; use multiple calls with date-based filtering on your side if you need more.',
    body: `{
  "state": "accepted | synchronized | delivered | failed_to_sync",
  "limit": 100,
  "client_id":   "optional — Client.id",
  "client_slug": "optional — Client.slug (e.g. \\"apple-inc\\")"
}`,
    response: `{
  "count": 12,
  "projects": [
    {
      "id": "abc123",
      "external_id": "symfonie:48211",
      "state": "accepted",
      "portal": "symfonie",
      "name": "ACME — Press release EN→TR",
      "client":    { "id": "cli_1", "slug": "apple-inc", "display_name": "Apple" },
      "friendly":  { "client_name": "Apple", "project_name": "Press May 22", "account_name": "Apple", "workflow_name": "MTPE-light" },
      "raw":       { "account_name": "Apple Inc.", "account_id": "47110", "project_id": "P-2026-117", "workflow_name": "MTPE-light" },
      "source_language": "en-US",
      "target_language": "tr-TR",
      "word_count": 1280,
      "price": 96.0,
      "currency": "USD",
      "due_date": "2026-05-22T10:00:00Z",
      "accepted_at": "2026-05-16T09:14:02Z",
      "cat_analysis": {
        "weighted_wc": 189.35,
        "parser_type": "MemSource",
        "mt_weight_coefficient": null,
        "bands": { "context": 320, "rep": 12, "match100": 145, "fuzzy_95_99": 38, "fuzzy_85_94": 60, "fuzzy_75_84": 25, "fuzzy_50_74": 18, "mt_post_edit": 0, "no_match": 662 }
      },
      "vendor_payment": {
        "partner_id": 4421, "partner_code": "MORAVIA", "partner_name": "Moravia IT s.r.o.",
        "currency": "EUR", "unit_cost": 0.045, "partner_price": 8.52,
        "usd_unit_cost": 0.049, "usd_price": 9.28
      },
      "project_notes": "MT post-edit project; expected quality = human translation. Refer to AWS docs style guide."
    }
  ]
}`,
    curl: `curl -X POST \\
  -H "Authorization: Apikey $DISPATCH_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"state":"accepted","limit":50}' \\
  https://<your-app>/functions/apiProjectsList`,
    notes: 'List omits the per-project destination block (BMS mapping) to keep payloads small. Use apiProjectsGet for the full envelope when you need destination/mapping_applied/unmapped.',
  },
  {
    fn: 'apiProjectsGet',
    scope: 'read:projects',
    title: 'Inspect a single project (with BMS-mapped destination)',
    description:
      'Returns the full project envelope: raw upstream data, the destination block (post-FieldMapping, null-on-miss for safety), the friendly-name passthrough block, attachments_count, CAT analysis, vendor payment, project notes. Use this as the canonical "ingest into BMS" payload.',
    body: `{ "id": "abc123" }`,
    response: `{
  "project": {
    "id": "abc123",
    "state": "accepted",
    "portal": "symfonie",
    "external_id": "symfonie:48211",
    "client":      { "id": "cli_1", "slug": "apple-inc", "display_name": "Apple" },
    "origin":      { "client_name": "Apple Inc.", "workflow_name": "MTPE-light", "...": "..." },
    "destination": { "source_language": "EN", "target_language": "TR", "client_name": "APPLE_BMS" },
    "friendly":    { "client_name": "Apple", "project_name": "Press May 22", "account_name": "Apple", "workflow_name": "MTPE-light" },
    "mapping_applied": [
      { "field": "client_name", "from": "Apple Inc.", "to": "APPLE_BMS" }
    ],
    "unmapped": [
      { "field": "workflow_name", "source_value": "MTPE-light" }
    ],
    "attachments_count": 3,
    "cat_analysis": {
      "weighted_wc": 537.2, "parser_type": "Junction", "mt_weight_coefficient": 0.70,
      "bands": { "fuzzy_95_99": 125, "fuzzy_85_94": 519, "fuzzy_75_84": 216, "mt_post_edit": 263, "no_match": 0, "...": 0 }
    },
    "vendor_payment": { "partner_name": "Moravia IT s.r.o.", "currency": "EUR", "usd_price": 9.28, "...": "..." },
    "project_notes": "MT post-edit project; expected quality = human translation."
  }
}`,
    notes: 'destination is null-on-miss (BMS safety — see /friendly-raw section). friendly is passthrough (raw value if no rumuz exists). cat_analysis is null when no leverage data was captured at accept time.',
  },
  {
    fn: 'apiProjectsAcknowledge',
    scope: 'write:projects',
    title: 'Mark a project as picked up by the BMS',
    description:
      'Transitions the project from "accepted" → "synchronized" and emits the project.synchronized webhook. Idempotent: calling it on an already-synchronized project is a no-op and returns the current state.',
    body: `{ "id": "abc123" }`,
    response: `{ "success": true, "state": "synchronized", "acknowledged_at": "2026-05-16T14:32:11Z" }`,
    notes: 'Records who acknowledged in Project.acknowledged_by (the API key id). Audit-visible on the Dashboard.',
  },
  {
    fn: 'apiProjectsDeliver',
    scope: 'write:projects',
    title: 'Mark a project as delivered to the end-client',
    description:
      'Transitions the project from "synchronized" → "delivered" and emits the project.delivered webhook. Returns 409 if the project isn\'t in "synchronized" state.',
    body: `{ "id": "abc123" }`,
    response: `{ "success": true, "state": "delivered", "delivered_at": "2026-05-22T11:48:00Z" }`,
    notes: 'Final lifecycle transition. Does NOT trigger upstream portal complete/deliver commands — Dispatch is record-keeping only at this stage.',
  },
  {
    fn: 'apiMappingsList',
    scope: 'read:projects',
    title: 'List active field mappings',
    description:
      'Returns the FieldMapping translation table for your tenant — useful for the BMS to preview / cache how source values become destination values before importing projects.',
    body: `{ "portal": "symfonie", "field": "workflow_name" }`,
    response: `{
  "count": 3,
  "mappings": [
    { "portal": "symfonie", "field": "workflow_name", "source_value": "MTPE-light", "destination_value": "post_edit" },
    { "portal": "*",        "field": "target_language", "source_value": "tr-TR",     "destination_value": "TR" }
  ]
}`,
    notes: 'portal:"*" mappings apply to every portal — useful for language code normalisation across connectors.',
  },
  {
    fn: 'apiAttachmentsList',
    scope: 'read:projects',
    title: "List a project's attachments",
    description:
      'Returns the ProjectAttachment catalog for a given project — handoff files, references, deliveries. Storage is Dropbox-backed today. Symfonie populates this on accept; Junction and GlobalLink return empty arrays.',
    body: `{ "project_id": "abc123" }`,
    response: `{
  "count": 2,
  "attachments": [
    { "id": "att_1", "name": "source.docx",  "size": 18230, "kind": "handoff",   "storage_path": "/Dispatch/Apple/...source.docx" },
    { "id": "att_2", "name": "style.pdf",    "size": 92341, "kind": "reference", "storage_path": "/Dispatch/Apple/...style.pdf"    }
  ]
}`,
  },
  {
    fn: 'apiAttachmentsDownload',
    scope: 'read:projects',
    title: 'Get a short-lived signed download URL',
    description:
      'Returns a Dropbox signed URL good for ~4 hours. The URL has no auth requirement on download — keep it private and pull files immediately into your own storage.',
    body: `{ "attachment_id": "att_1" }`,
    response: `{ "url": "https://dl.dropboxusercontent.com/...", "expires_in_seconds": 14400 }`,
    notes: 'Re-call this endpoint to get a fresh URL after 4 hours. URLs are single-attachment — no bulk-download endpoint today.',
  },
  {
    fn: 'apiSpec',
    scope: 'public',
    title: 'Machine-readable API spec (no auth)',
    description:
      'Discovery endpoint — returns the same surface this page documents, in JSON. Useful for BMS-side schema generation and CI breaking-change detection.',
    response: `{ "name": "Dispatch Hub — BMS Integration API", "version": "2.3.0-vendor", "endpoints": [...], "...": "..." }`,
  },
];

export default function Documentation() {
  return (
    <div className="px-8 py-7 max-w-6xl mx-auto">
      <header className="mb-10">
        <div className="flex items-center gap-2 mb-1.5">
          <BookOpen className="w-4 h-4 text-ink-3" />
          <h1 className="text-[22px] font-semibold tracking-tight text-ink-1">API Documentation</h1>
        </div>
        <p className="text-[13px] text-ink-3 italic-editorial max-w-2xl">
          The full reference for the Dispatch Hub BMS Integration API — every endpoint, every webhook event, every signature header. Manage your keys and webhook subscriptions on the <a href="/api" className="text-accent hover:underline">Keys &amp; webhooks</a> page.
        </p>
      </header>

      <div className="flex gap-10">
        <DocTOC items={TOC} />

        <main className="flex-1 min-w-0">
          {/* ─────────────────────────── OVERVIEW ─────────────────────────── */}
          <DocSection id="overview" eyebrow="Getting started" title="Overview">
            <p>
              Dispatch Hub is the integration layer between three vendor portals (Symfonie/Moravia, Junction/Welocalize, GlobalLink/TransPerfect) and your BMS. We poll the portals, apply auto-accept rules, capture CAT leverage + financial data at accept time, and expose every accepted task as a uniform <code className="font-mono bg-surface-2 px-1 rounded">project</code> record over this API.
            </p>
            <p>
              Every endpoint is a <code className="font-mono bg-surface-2 px-1 rounded">POST</code> with a JSON body, authenticated by a single header. The lifecycle of a project moves through four states: <code className="font-mono bg-surface-2 px-1 rounded">accepted → synchronized → delivered</code>, with <code className="font-mono bg-surface-2 px-1 rounded">failed_to_sync</code> as the escape hatch. Each transition emits a webhook so your BMS never has to poll if you don't want to.
            </p>
            <p className="text-[11.5px] text-ink-3 italic-editorial border-l-2 border-line-2 pl-3">
              <strong className="not-italic text-ink-2">Schema versioning.</strong> The current schema is <code className="font-mono not-italic">v2.3.0-vendor</code> (see <code className="font-mono not-italic">apiSpec.version</code>). Additive changes (new fields, new optional body params, new webhook events) ship without notice. Breaking changes get a new major version and a migration window — hit <code className="font-mono not-italic">apiSpec</code> from CI to detect them.
            </p>
          </DocSection>

          {/* ─────────────────────────── QUICKSTART ─────────────────────────── */}
          <DocSection id="quickstart" eyebrow="Getting started" title="Quickstart — your first integration">
            <p>The minimum path from zero to a BMS reading projects from Dispatch:</p>
            <ol className="list-decimal ml-5 space-y-2 text-[12.5px]">
              <li>Create an API key on the <a href="/api" className="text-accent hover:underline">Keys &amp; webhooks</a> page. Default scopes (<code className="font-mono bg-surface-2 px-1 rounded">read:projects</code>, <code className="font-mono bg-surface-2 px-1 rounded">write:projects</code>) cover everything below. Copy the token <em>once</em> — it's never shown again.</li>
              <li>Verify the key works:
                <CodeBlock>{`curl -X POST \\
  -H "Authorization: Apikey $DISPATCH_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"state":"accepted","limit":1}' \\
  https://<your-app>/functions/apiProjectsList`}</CodeBlock>
              </li>
              <li>Set up a webhook subscription (optional but recommended) — point at your BMS's ingest endpoint, generate a 32-byte secret, subscribe to <code className="font-mono bg-surface-2 px-1 rounded">project.accepted</code>.</li>
              <li>For each project that lands, call <code className="font-mono bg-surface-2 px-1 rounded">apiProjectsGet</code> to retrieve the full envelope (with destination mapping). Pull files via <code className="font-mono bg-surface-2 px-1 rounded">apiAttachmentsList</code> + <code className="font-mono bg-surface-2 px-1 rounded">apiAttachmentsDownload</code>.</li>
              <li>Once ingested, call <code className="font-mono bg-surface-2 px-1 rounded">apiProjectsAcknowledge</code> to flip the project to <code className="font-mono bg-surface-2 px-1 rounded">synchronized</code> so it stops appearing in the accepted-inbox poll.</li>
            </ol>
          </DocSection>

          {/* ─────────────────────────── LIFECYCLE ─────────────────────────── */}
          <DocSection id="lifecycle" eyebrow="Reference" title="Project lifecycle">
            <p>Every project record moves through exactly four states. Transitions are unidirectional except for <code className="font-mono bg-surface-2 px-1 rounded">failed_to_sync</code>, which can be reset by an operator.</p>
            <CodeBlock language="text">{`           ┌─────────────────────────────────────────────┐
           ▼                                             │
       accepted ──────► synchronized ──────► delivered   │
           │                                             │
           └──────────► failed_to_sync ──────────────────┘
                              ▲
                              │ (BMS rejected the project, or persistent sync error)
                              │ /projectResetSync flips it back to "accepted"
`}</CodeBlock>
            <FieldTable rows={[
              { field: 'accepted',        meaning: <>Dispatch has accepted the upstream task and recorded a Project record. Webhook: <code className="font-mono">project.accepted</code>.</> },
              { field: 'synchronized',    meaning: <>BMS acknowledged via <code className="font-mono">apiProjectsAcknowledge</code>. The project is now the BMS's responsibility. Webhook: <code className="font-mono">project.synchronized</code>.</> },
              { field: 'delivered',       meaning: <>BMS marked the project delivered via <code className="font-mono">apiProjectsDeliver</code>. Terminal state. Webhook: <code className="font-mono">project.delivered</code>.</> },
              { field: 'failed_to_sync',  meaning: <>BMS-side ingestion failed (4xx response, validation error, etc.). Visible on the Dashboard "Action needed" panel. Operator-resettable.</> },
            ]} />
          </DocSection>

          {/* ─────────────────────────── PORTAL MATRIX ─────────────────────────── */}
          <DocSection id="portal-matrix" eyebrow="Reference" title="Portal capabilities — what to expect per connector">
            <p>
              The API surface is uniform, but the underlying portals expose different data. This matrix tells you which fields you can rely on per portal — so your BMS code can branch on <code className="font-mono bg-surface-2 px-1 rounded">project.portal</code> instead of discovering gaps at runtime.
            </p>
            <PortalMatrix rows={PORTAL_MATRIX} columns={PORTAL_COLUMNS} />
            <p className="text-[11.5px] text-ink-3 italic-editorial border-l-2 border-line-2 pl-3 mt-4">
              <strong className="not-italic text-ink-2">Reading the cells.</strong> <em>Full</em> means the field is present with the documented semantics on every project from that portal. <em>Partial</em> means present-with-caveats (read the note). <em>Not wired</em> means we haven't connected it yet — the field is always null/empty/0. <em>N/A</em> means the upstream portal doesn't have the concept at all.
            </p>
          </DocSection>

          {/* ─────────────────────────── AUTH ─────────────────────────── */}
          <DocSection id="auth" eyebrow="Authentication" title="API keys & headers">
            <p>
              Every call requires an <code className="font-mono bg-surface-2 px-1 rounded">Authorization</code> header carrying an API key your tenant minted. Two schemes are accepted:
            </p>
            <CodeBlock>{`Authorization: Apikey <token>
# or
Authorization: Bearer <token>`}</CodeBlock>
            <p>
              The <code className="font-mono bg-surface-2 px-1 rounded">Apikey</code> scheme is preferred and what you'll see in our examples. Revoked keys reject with <code className="font-mono bg-surface-2 px-1 rounded">401 Unauthorized</code>; missing scopes reject with <code className="font-mono bg-surface-2 px-1 rounded">403 Forbidden</code>. Keys are scoped to one tenant — cross-tenant project IDs are 404.
            </p>
          </DocSection>

          {/* ─────────────────────────── KEYS ─────────────────────────── */}
          <DocSection id="keys" eyebrow="Key management" title="Creating, viewing, and revoking keys">
            <p>
              Keys are managed on the <a href="/api" className="text-accent hover:underline">Keys &amp; webhooks</a> page. The flow:
            </p>
            <ul className="list-disc ml-5 space-y-1 text-[12.5px]">
              <li><strong className="text-ink-1">Create</strong> — name the key (e.g. "Dispatch production") and submit. The full token is shown <em>once</em> — copy it immediately.</li>
              <li><strong className="text-ink-1">View</strong> — only the prefix (first 12 characters) and "last used" metadata are visible after creation. Full tokens are never echoed back.</li>
              <li><strong className="text-ink-1">Revoke</strong> — sets <code className="font-mono bg-surface-2 px-1 rounded">revoked_at</code>. Subsequent requests with that key receive 401. Revocation cannot be undone — mint a fresh key.</li>
            </ul>
            <p>
              Default scopes for new keys are <code className="font-mono bg-surface-2 px-1 rounded">read:projects</code> and <code className="font-mono bg-surface-2 px-1 rounded">write:projects</code>. The endpoint reference below labels each call with its required scope.
            </p>
          </DocSection>

          {/* ─────────────────────────── ENDPOINTS ─────────────────────────── */}
          <DocSection id="endpoints" eyebrow="Reference" title="Endpoints">
            <p>
              Each endpoint is invoked as a Base44 function URL — find the full URL on the Functions dashboard. The function name is the last path segment.
            </p>
            <div className="space-y-4 not-prose">
              {ENDPOINTS.map((ep) => (
                <EndpointBlock key={ep.fn} {...ep} />
              ))}
            </div>
          </DocSection>

          {/* ─────────────────────────── PROJECT PAYLOAD ANATOMY ─────────────────────────── */}
          <DocSection id="project-payload" eyebrow="Reference" title="Project payload — top-level fields">
            <p>The same project shape is used in list responses, get responses, and webhook payloads. Top-level fields:</p>
            <FieldTable showType rows={[
              { field: 'id',              type: 'string',  meaning: <>Dispatch-internal project ID. Use this for every subsequent API call.</> },
              { field: 'external_id',     type: 'string',  meaning: <>Stable cross-system project ID, formatted <code className="font-mono">{`<portal>:<upstream_id>`}</code> (e.g. <code className="font-mono">symfonie:48211</code>).</> },
              { field: 'state',           type: 'enum',    meaning: <><code className="font-mono">accepted</code> / <code className="font-mono">synchronized</code> / <code className="font-mono">delivered</code> / <code className="font-mono">failed_to_sync</code>.</> },
              { field: 'portal',          type: 'string',  meaning: <><code className="font-mono">symfonie</code> / <code className="font-mono">junction</code> / <code className="font-mono">globallink</code>. Use this to branch on portal-specific quirks.</> },
              { field: 'client',          type: 'object|null', meaning: <>Agency end-customer attribution: <code className="font-mono">{`{ id, slug, display_name }`}</code>. <code className="font-mono">null</code> when the originating portal isn't mapped to a Client yet — treat as "unassigned".</> },
              { field: 'name',            type: 'string',  meaning: <>Display name (typically the upstream task name).</> },
              { field: 'client_name',     type: 'string',  meaning: <>Raw upstream client/customer name. For routing, prefer <code className="font-mono">client.slug</code> or <code className="font-mono">friendly.client_name</code>.</> },
              { field: 'project_name',    type: 'string',  meaning: <>Raw upstream project name.</> },
              { field: 'source_language', type: 'string',  meaning: <>Raw upstream language code (e.g. <code className="font-mono">en-US</code>). Use FieldMapping to normalise.</> },
              { field: 'target_language', type: 'string',  meaning: <>Raw upstream language code (e.g. <code className="font-mono">tr-TR</code>).</> },
              { field: 'word_count',      type: 'number',  meaning: <>Total word count from the upstream portal. Distinct from <code className="font-mono">cat_analysis.weighted_wc</code>.</> },
              { field: 'price',           type: 'number',  meaning: <>Task-level USD price (Symfonie: FinanceRows MaxUsd sum). Distinct from <code className="font-mono">vendor_payment.usd_price</code> (vendor PO breakdown).</> },
              { field: 'currency',        type: 'string',  meaning: <>Always <code className="font-mono">USD</code> at the project level. For vendor settlement currency see <code className="font-mono">vendor_payment.currency</code>.</> },
              { field: 'due_date',        type: 'ISO date',meaning: <>Upstream due date. May shift after accept — subscribe to <code className="font-mono">project.updated</code> webhook for change notifications (Symfonie only today).</> },
              { field: 'accepted_at',     type: 'ISO date',meaning: <>When Dispatch accepted the task. Always set.</> },
              { field: 'acknowledged_at', type: 'ISO date',meaning: <>When the BMS called <code className="font-mono">apiProjectsAcknowledge</code>. <code className="font-mono">null</code> while state=accepted.</> },
              { field: 'delivered_at',    type: 'ISO date',meaning: <>When the BMS called <code className="font-mono">apiProjectsDeliver</code>. <code className="font-mono">null</code> until state=delivered.</> },
              { field: 'friendly',        type: 'object',  meaning: <>Human-friendly name overlay. See "friendly vs raw vs destination" below.</> },
              { field: 'raw',             type: 'object',  meaning: <>Upstream stable identifiers. See "friendly vs raw vs destination" below.</> },
              { field: 'destination',     type: 'object',  meaning: <>BMS-mapped values (Get only — not on List). Null-on-miss per field. See "friendly vs raw vs destination" below.</> },
              { field: 'cat_analysis',    type: 'object|null', meaning: <>Leverage band breakdown + weighted_wc. See dedicated section.</> },
              { field: 'vendor_payment',  type: 'object|null', meaning: <>What the originating portal owes us (vendor settlement). See dedicated section.</> },
              { field: 'project_notes',   type: 'string',  meaning: <>Free-text brief from the upstream portal. Empty string when none.</> },
              { field: 'attachments_count', type: 'number', meaning: <>Number of files (Get only). Use <code className="font-mono">apiAttachmentsList</code> to enumerate.</> },
              { field: 'origin',          type: 'object',  meaning: <>Full raw upstream payload (portal-specific, unstable shape). Last-resort field — prefer the normalised fields above.</> },
            ]} />
          </DocSection>

          {/* ─────────────────────────── CAT ANALYSIS ─────────────────────────── */}
          <DocSection id="cat-analysis" eyebrow="Reference" title="CAT analysis block">
            <p>
              Every project payload carries a <code className="font-mono bg-surface-2 px-1 rounded">cat_analysis</code> block when CAT leverage was captured at accept time. The shape is portal-neutral — bands have the same meaning whether the underlying source is Symfonie (MemSource), GlobalLink (PD), or Junction.
            </p>
            <CodeBlock language="json">{`{
  "weighted_wc": 537.2,
  "parser_type": "Junction",
  "mt_weight_coefficient": 0.70,
  "bands": {
    "context":       0,
    "rep":           0,
    "match100":      0,
    "fuzzy_95_99": 125,
    "fuzzy_85_94": 519,
    "fuzzy_75_84": 216,
    "fuzzy_50_74":   0,
    "rep_95_99":     0,
    "rep_85_94":     0,
    "rep_75_84":     0,
    "rep_50_74":     0,
    "mt_post_edit":263,
    "no_match":      0
  }
}`}</CodeBlock>
            <FieldTable rows={[
              { field: 'weighted_wc',           meaning: <>Source-of-truth weighted word count. <strong className="text-ink-1">Use this directly for billing</strong> — don't re-derive from bands. Junction: precomputed upstream. Symfonie: native <code className="font-mono">CalculatedQuantity</code> from the customer's per-band grid. GlobalLink: computed via MTPE-aligned formula.</> },
              { field: 'parser_type',           meaning: <>CAT tool that produced the analysis (<code className="font-mono">MemSource</code>, <code className="font-mono">Junction</code>, etc.). May be <code className="font-mono">null</code>.</> },
              { field: 'mt_weight_coefficient', meaning: <>WWC weight applied to the <code className="font-mono">mt_post_edit</code> band (0.0–1.0). Junction TikTok-program default = <code className="font-mono">0.70</code>. <code className="font-mono">null</code> for tasks without an MTPE band.</> },
              { field: 'bands.context',         meaning: <>In-context / context-TM matches.</> },
              { field: 'bands.rep',             meaning: <>Pure cross-segment repetitions.</> },
              { field: 'bands.match100',        meaning: <>100% TM matches.</> },
              { field: 'bands.fuzzy_*',         meaning: <>Pure fuzzy bands (95-99 / 85-94 / 75-84 / 50-74). Reps inside a fuzzy band live in the corresponding <code className="font-mono">rep_*</code> field, not here. Junction has no 50-74 band.</> },
              { field: 'bands.rep_*',           meaning: <>GlobalLink-only sub-bands. Symfonie/Junction emit <code className="font-mono">0</code>.</> },
              { field: 'bands.mt_post_edit',    meaning: <><strong className="text-ink-1">Junction-only today.</strong> Machine-translation post-edit words. WWC contribution = <code className="font-mono">words × mt_weight_coefficient</code>.</> },
              { field: 'bands.no_match',        meaning: <>No-match (new) words. Junction surfaces this as <em>pure</em> <code className="font-mono">newWords</code> — <code className="font-mono">mtPostEdit</code> is a separate band.</> },
            ]} />

            <h3 className="text-[13px] font-semibold text-ink-1 mt-6 mb-2">Weighted word-count formulas</h3>
            <p>
              <code className="font-mono bg-surface-2 px-1 rounded">weighted_wc</code> is always the source of truth. The formulas below explain how it's produced, useful only for audit / debugging.
            </p>
            <p className="font-mono text-[11.5px] text-ink-2 bg-surface-2 p-3 rounded border border-line-1 whitespace-pre-wrap">
{`Junction:
  weighted_wc = match100      × 0.10
              + fuzzy_95_99   × 0.30
              + fuzzy_85_94   × 0.40
              + fuzzy_75_84   × 0.50
              + mt_post_edit  × mt_weight_coefficient   ← per-task (default 0.70)
              + no_match      × 1.00
  (context, rep are zero-weighted; no 50-74 band.)

GlobalLink:
  weighted_wc = (fuzzy_95_99 + rep_95_99) × 0.20
              + (fuzzy_85_94 + rep_85_94) × 0.35
              + (fuzzy_75_84 + rep_75_84) × 0.45
              + (fuzzy_50_74 + rep_50_74 + no_match) × 0.60

Symfonie:
  weighted_wc = CalculatedQuantity (customer's actual per-band grid — read from Symfonie)
  fallback:   fuzzy_95_99 × 0.20 + fuzzy_85_94 × 0.35 + fuzzy_75_84 × 0.45 + (fuzzy_50_74 + no_match) × 0.60
  (used only when Symfonie didn't emit a calculated value — rare.)`}
            </p>
            <p className="text-[11.5px] text-ink-3 italic-editorial border-l-2 border-line-2 pl-3 mt-4">
              <strong className="not-italic text-ink-2">When is <code className="font-mono not-italic">cat_analysis</code> null?</strong> Older projects accepted before CAT capture landed, portals without leverage analysis attached, or rejections. Treat null as "no data" rather than "all zero" — don't divide by it.
            </p>
            <p className="text-[11.5px] text-ink-3 italic-editorial border-l-2 border-line-2 pl-3">
              <strong className="not-italic text-ink-2">Symfonie WWC source-of-truth (v2.3).</strong> Symfonie's native <code className="font-mono not-italic">CalculatedQuantity</code> reflects the <em>customer's</em> actual per-band weight grid (Amazon, Adloc, Apple all carry different grids). The generic formula remains only as a fallback. <strong className="not-italic text-ink-2">Don't re-derive from bands</strong> — the derivation diverges from Symfonie's real pricing.
            </p>
          </DocSection>

          {/* ─────────────────────────── VENDOR PAYMENT ─────────────────────────── */}
          <DocSection id="vendor-payment" eyebrow="Reference" title="Vendor payment block">
            <p>
              The <code className="font-mono bg-surface-2 px-1 rounded">vendor_payment</code> block on every project payload describes <strong>what the originating portal owes us</strong>. We are the vendor — <code className="font-mono bg-surface-2 px-1 rounded">partner_name</code> identifies the entity paying us (Moravia, Welocalize, TransPerfect, ...). Use this for invoicing and vendor-currency reconciliation downstream.
            </p>
            <CodeBlock language="json">{`{
  "partner_id": 4421,
  "partner_code": "MORAVIA",
  "partner_name": "Moravia IT s.r.o.",
  "currency": "EUR",
  "unit_cost": 0.045,
  "partner_price": 8.52,
  "usd_unit_cost": 0.049,
  "usd_price": 9.28
}`}</CodeBlock>
            <FieldTable rows={[
              { field: 'partner_id',              meaning: <>Portal-internal numeric ID for the paying partner. <code className="font-mono">null</code> when the portal didn't supply one.</> },
              { field: 'partner_code',            meaning: <>Short partner code (often empty for direct relationships).</> },
              { field: 'partner_name',            meaning: <>Display name of the paying entity.</> },
              { field: 'currency',                meaning: <>Vendor's settlement currency (ISO code, e.g. <code className="font-mono">EUR</code>, <code className="font-mono">USD</code>).</> },
              { field: 'unit_cost / partner_price', meaning: <>Per-word rate and total <em>in <code className="font-mono">currency</code></em>.</> },
              { field: 'usd_unit_cost / usd_price', meaning: <>Same fields converted to USD. Use <code className="font-mono">usd_price</code> for cross-portal comparison and USD-invoicing flows.</> },
            ]} />
            <p className="text-[11.5px] text-ink-3 italic-editorial border-l-2 border-line-2 pl-3 mt-4">
              <strong className="not-italic text-ink-2">When is <code className="font-mono not-italic">vendor_payment</code> null?</strong> When the upstream portal didn't attach a PurchaseOrder at accept time. Symfonie populates this on most accepted tasks. GlobalLink and Junction don't surface a vendor-payment block today — those rows stay <code className="font-mono not-italic">null</code>.
            </p>
          </DocSection>

          {/* ─────────────────────────── PROJECT NOTES ─────────────────────────── */}
          <DocSection id="project-notes" eyebrow="Reference" title="Project notes">
            <p>
              The <code className="font-mono bg-surface-2 px-1 rounded">project_notes</code> field carries free-text instructions / special handling guidance attached at the <strong>project level</strong> by the originating portal. BMS-facing — Dispatch reads it to brief PMs.
            </p>
            <p className="text-[11.5px] text-ink-3 italic-editorial border-l-2 border-line-2 pl-3">
              Symfonie source: <code className="font-mono not-italic">Project.Notes</code> (project-level, not task-level — distinct from any task-level instructions). Empty string when not provided. GlobalLink and Junction aren't wired for this field yet — those rows always carry an empty string.
            </p>
          </DocSection>

          {/* ─────────────────────────── FRIENDLY VS RAW VS DESTINATION ─────────────────────────── */}
          <DocSection id="friendly-raw" eyebrow="Reference" title="friendly vs raw vs destination — three views of the same data">
            <p>Every project carries three parallel "views" of names and identifiers. Knowing when to use which is the most common BMS integration question:</p>
            <FieldTable rows={[
              { field: 'raw.*',         meaning: <><strong className="text-ink-1">Upstream truth.</strong> The exact values as they arrived from the portal. Use for stable identifiers (<code className="font-mono">raw.account_id</code>, <code className="font-mono">raw.project_id</code>) and for audit / debugging. Never displayed to end users.</> },
              { field: 'friendly.*',    meaning: <><strong className="text-ink-1">Human-friendly overlay.</strong> Passthrough: returns the short rumuz from <code className="font-mono">FriendlyName</code> table if one matches, otherwise returns the raw value unchanged. <strong className="text-ink-1">Safe to display</strong> — never null, never empty.</> },
              { field: 'destination.*', meaning: <><strong className="text-ink-1">BMS-mapped values.</strong> Returns the <code className="font-mono">destination_value</code> from <code className="font-mono">FieldMapping</code>, or <code className="font-mono">null</code> when no mapping exists. <strong className="text-ink-1">Null-on-miss is intentional</strong> — your BMS should refuse to import an unmapped value rather than guessing. Detail-only (apiProjectsGet); not on List.</> },
            ]} />
            <p className="text-[11.5px] text-ink-3 italic-editorial border-l-2 border-line-2 pl-3">
              <strong className="not-italic text-ink-2">Rule of thumb.</strong> Display → <code className="font-mono not-italic">friendly</code>. Routing & joins → <code className="font-mono not-italic">raw</code> (IDs) or <code className="font-mono not-italic">client.slug</code>. BMS import → <code className="font-mono not-italic">destination</code> with strict null handling.
            </p>
          </DocSection>

          {/* ─────────────────────────── RECIPES ─────────────────────────── */}
          <DocSection id="recipes" eyebrow="How-to" title="Recipes — real BMS scenarios">
            <p>Each recipe maps one BMS workflow onto a specific sequence of API calls. Use these as starting templates.</p>
            <div className="space-y-3 not-prose">
              {RECIPES.map((r) => (
                <Recipe key={r.id} recipe={r} />
              ))}
            </div>
          </DocSection>

          {/* ─────────────────────────── WEBHOOKS ─────────────────────────── */}
          <DocSection id="webhooks" eyebrow="Outbound events" title="Webhooks">
            <p>
              When something interesting happens to a project, Dispatch Hub POSTs a JSON envelope to every active <code className="font-mono bg-surface-2 px-1 rounded">WebhookSubscription</code> whose event list matches.
            </p>
            <p>
              Subscriptions are created on the <a href="/api" className="text-accent hover:underline">Keys &amp; webhooks</a> page. Each subscription has a URL, an optional signing secret, and a set of events it cares about. An empty <code className="font-mono bg-surface-2 px-1 rounded">events</code> array means "every event."
            </p>
          </DocSection>

          <DocSection id="webhook-events" eyebrow="Webhooks" title="Event catalog">
            <FieldTable fieldHeader="Event" meaningHeader="Fires when" rows={[
              { field: 'project.accepted',       meaning: <>A new project is accepted into Dispatch Hub from a connector (rule-based or manual).</> },
              { field: 'project.updated',        meaning: <>A material field (e.g. due_date) changed on an accepted project. Symfonie-only today.</> },
              { field: 'project.synchronized',   meaning: <>BMS acknowledged the project via <code className="font-mono">apiProjectsAcknowledge</code>.</> },
              { field: 'project.delivered',     meaning: <>BMS marked the project delivered via <code className="font-mono">apiProjectsDeliver</code>.</> },
              { field: 'project.failed_to_sync', meaning: <>A persistent sync error parked the project in failed_to_sync.</> },
            ]} />
          </DocSection>

          <DocSection id="webhook-payload" eyebrow="Webhooks" title="Webhook payload">
            <p>The body posted to your URL is a JSON envelope with the event name, a delivery timestamp, and a project snapshot. The <code className="font-mono bg-surface-2 px-1 rounded">project</code> field carries the same shape documented in <a href="#project-payload" className="text-accent hover:underline">Project payload anatomy</a>.</p>
            <CodeBlock language="json">{`{
  "event": "project.synchronized",
  "delivered_at": "2026-05-16T14:32:11.482Z",
  "project": {
    "id": "abc123",
    "external_id": "symfonie:48211",
    "state": "synchronized",
    "portal": "symfonie",
    "name": "ACME — Press release EN→TR",
    "source_language": "en-US",
    "target_language": "tr-TR",
    "word_count": 1280,
    "price": 96.0,
    "currency": "USD",
    "due_date": "2026-05-22T10:00:00Z",
    "accepted_at": "2026-05-16T09:14:02Z",
    "acknowledged_at": "2026-05-16T14:32:11Z",
    "delivered_at": null
  }
}`}</CodeBlock>
            <p>Two delivery headers accompany every POST:</p>
            <ul className="list-disc ml-5 space-y-1 text-[12.5px]">
              <li><code className="font-mono bg-surface-2 px-1 rounded">X-Dispatch-Event</code> — the event name (so you can route without parsing).</li>
              <li><code className="font-mono bg-surface-2 px-1 rounded">X-Dispatch-Signature</code> — only present if the subscription has a secret. See below.</li>
            </ul>
          </DocSection>

          <DocSection id="webhook-security" eyebrow="Webhooks" title="Signature verification (HMAC-SHA256)">
            <p>
              If your subscription has a <code className="font-mono bg-surface-2 px-1 rounded">secret</code> set, Dispatch Hub signs the raw request body with HMAC-SHA256 and sends the hex digest in the <code className="font-mono bg-surface-2 px-1 rounded">X-Dispatch-Signature</code> header in the form <code className="font-mono bg-surface-2 px-1 rounded">sha256=&lt;hexdigest&gt;</code>.
            </p>
            <p>To verify on the receiving end (Node.js):</p>
            <CodeBlock language="javascript">{`import crypto from 'node:crypto';

function isValid(rawBody, signatureHeader, secret) {
  if (!signatureHeader?.startsWith('sha256=')) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)         // use the raw bytes, NOT a re-stringified JSON
    .digest('hex');
  const received = signatureHeader.slice('sha256='.length);
  return crypto.timingSafeEqual(
    Buffer.from(expected, 'hex'),
    Buffer.from(received, 'hex')
  );
}`}</CodeBlock>
            <p className="text-[11.5px] text-ink-3 italic-editorial border-l-2 border-line-2 pl-3">
              Always compare with a timing-safe equality check (<code className="font-mono">timingSafeEqual</code>) — a plain <code className="font-mono">===</code> leaks information through response timing.
            </p>
          </DocSection>

          <DocSection id="webhook-retries" eyebrow="Webhooks" title="Retries & failures">
            <p>
              The first delivery is attempted inline. If it fails (network error or any non-2xx response), the delivery is logged with status <code className="font-mono bg-surface-2 px-1 rounded">retry_scheduled</code> and a <code className="font-mono bg-surface-2 px-1 rounded">next_retry_at</code> ~60 seconds in the future.
            </p>
            <p>
              A background sweep (<code className="font-mono bg-surface-2 px-1 rounded">webhookRetry</code>) picks up due retries, attempts the POST again, and increments the <code className="font-mono bg-surface-2 px-1 rounded">attempt</code> counter. Successful retries flip the row to <code className="font-mono bg-surface-2 px-1 rounded">success</code>; persistent failures eventually settle in <code className="font-mono bg-surface-2 px-1 rounded">failed</code>.
            </p>
            <p>
              Every attempt — success or failure — is recorded as a <code className="font-mono bg-surface-2 px-1 rounded">WebhookDelivery</code> row, surfaced in the deliveries log on the Keys &amp; webhooks page. To investigate a failing endpoint, inspect <code className="font-mono bg-surface-2 px-1 rounded">http_status</code>, <code className="font-mono bg-surface-2 px-1 rounded">response_excerpt</code>, and <code className="font-mono bg-surface-2 px-1 rounded">error</code> on each row.
            </p>
            <p className="text-[11.5px] text-ink-3 italic-editorial border-l-2 border-line-2 pl-3">
              Your endpoint should respond as fast as possible (under a few seconds) with any 2xx status. Long-running work belongs behind a queue on your side — the webhook is just a notification.
            </p>
          </DocSection>

          {/* ─────────────────────────── ERRORS ─────────────────────────── */}
          <DocSection id="errors" eyebrow="Reference" title="Errors">
            <p>All endpoints return errors in a consistent JSON shape:</p>
            <CodeBlock language="json">{`{ "error": "human-readable description" }`}</CodeBlock>
            <FieldTable fieldHeader="Status" meaningHeader="Meaning" rows={[
              { field: '400', meaning: 'Required body field missing or malformed.' },
              { field: '401', meaning: 'No API key, malformed header, or key revoked.' },
              { field: '403', meaning: 'Key lacks the scope this endpoint requires.' },
              { field: '404', meaning: 'Project / attachment id not found in your tenant.' },
              { field: '409', meaning: 'Illegal state transition (e.g. delivering an unsynchronized project).' },
              { field: '500', meaning: 'Unexpected server error — safe to retry with exponential backoff.' },
            ]} />
          </DocSection>

          {/* ─────────────────────────── SPEC ─────────────────────────── */}
          <DocSection id="spec" eyebrow="Machine-readable" title="Spec endpoint">
            <p>
              For automated discovery, <code className="font-mono bg-surface-2 px-1 rounded">apiSpec</code> is public and returns the same surface this page documents, in JSON form. Hit it from your CI to detect breaking changes.
            </p>
            <CodeBlock>{`curl https://<your-app>/functions/apiSpec`}</CodeBlock>
          </DocSection>
        </main>
      </div>
    </div>
  );
}