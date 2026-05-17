import { BookOpen } from 'lucide-react';
import DocSection from '@/components/docs/DocSection';
import EndpointBlock from '@/components/docs/EndpointBlock';
import CodeBlock from '@/components/docs/CodeBlock';
import DocTOC from '@/components/docs/DocTOC';

// Living reference for the Dispatch Hub BMS Integration API.
// Operational tools (key management, webhook subscriptions, delivery log) live
// on the Keys & webhooks page — this page is pure documentation.
const TOC = [
  { id: 'overview',      label: 'Overview' },
  { id: 'auth',          label: 'Authentication' },
  { id: 'keys',          label: 'API keys' },
  { id: 'endpoints',     label: 'Endpoints' },
  { id: 'webhooks',      label: 'Webhooks' },
  { id: 'webhook-events',label: 'Event catalog' },
  { id: 'webhook-payload', label: 'Payload shape' },
  { id: 'webhook-security', label: 'Signature verification' },
  { id: 'webhook-retries',  label: 'Retries & failures' },
  { id: 'errors',        label: 'Errors' },
  { id: 'cat-analysis',  label: 'CAT analysis block' },
  { id: 'spec',          label: 'Machine-readable spec' },
];

const ENDPOINTS = [
  {
    fn: 'apiProjectsList',
    scope: 'read:projects',
    title: 'List projects by lifecycle state',
    description:
      'Pulls projects scoped to your tenant. Default state is "accepted" — i.e. the inbox the BMS still needs to acknowledge. Optional client_id / client_slug filters scope the result to a single end-customer.',
    body: `{
  "state": "accepted | synchronized | delivered | failed_to_sync",
  "limit": 100,
  "client_id": "optional",
  "client_slug": "optional (e.g. \\"apple-inc\\")"
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
      "friendly":  { "client_name": "Apple", "project_name": "Press May 22" },
      "raw":       { "account_name": "Apple Inc.", "account_id": "47110", "project_id": "P-2026-117", "workflow_name": "MTPE-light" },
      "source_language": "en-US",
      "target_language": "tr-TR",
      "word_count": 1280,
      "due_date": "2026-05-22T10:00:00Z",
      "cat_analysis": {
        "weighted_wc": 712.4,
        "parser_type": "MemSource",
        "bands": { "context": 320, "rep": 12, "match100": 145, "fuzzy_95_99": 38, "fuzzy_85_94": 60, "fuzzy_75_84": 25, "fuzzy_50_74": 18, "no_match": 662 }
      }
    }
  ]
}`,
    curl: `curl -X POST \\
  -H "Authorization: Apikey $DISPATCH_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"state":"accepted","limit":50}' \\
  https://<your-app>/functions/apiProjectsList`,
  },
  {
    fn: 'apiProjectsGet',
    scope: 'read:projects',
    title: 'Inspect a single project (origin + destination + attachments_count)',
    description:
      'Returns the full project envelope: the raw upstream data, the destination block (post-mapping, null-on-miss for safety), the friendly-name passthrough block, and an attachments_count.',
    body: `{ "id": "abc123" }`,
    response: `{
  "project": {
    "id": "abc123",
    "state": "accepted",
    "origin":      { "client_name": "Apple Inc.", "workflow_name": "MTPE-light", "...": "..." },
    "destination": { "client_name": "APPLE_BMS",  "workflow_name": "post_edit",  "...": "..." },
    "friendly":    { "client_name": "Apple",      "project_name": "Press May 22" },
    "mapping_applied": [
      { "field": "client_name", "from": "Apple Inc.", "to": "APPLE_BMS" }
    ],
    "attachments_count": 3,
    "cat_analysis": {
      "weighted_wc": 712.4,
      "parser_type": "MemSource",
      "bands": { "context": 320, "rep": 12, "match100": 145, "fuzzy_95_99": 38, "fuzzy_85_94": 60, "fuzzy_75_84": 25, "fuzzy_50_74": 18, "no_match": 662 }
    }
  }
}`,
    notes: 'destination is null-on-miss (BMS safety). friendly is passthrough — short rumuz when one exists, else raw upstream name. cat_analysis exposes the leverage breakdown captured at accept time (null when CAT data wasn\'t available).',
  },
  {
    fn: 'apiProjectsAcknowledge',
    scope: 'write:projects',
    title: 'Mark a project as picked up by the BMS',
    description:
      'Transitions the project from "accepted" → "synchronized" and emits the project.synchronized webhook. Idempotent: calling it on an already-synchronized project is a no-op.',
    body: `{ "id": "abc123" }`,
    response: `{ "success": true, "state": "synchronized" }`,
    notes: 'Fires the project.synchronized event to every matching webhook subscription.',
  },
  {
    fn: 'apiProjectsDeliver',
    scope: 'write:projects',
    title: 'Mark a project as delivered to the end-client',
    description:
      'Transitions the project from "synchronized" → "delivered" and emits the project.delivered webhook.',
    body: `{ "id": "abc123" }`,
    response: `{ "success": true, "state": "delivered" }`,
    notes: 'Final lifecycle transition. Closes the loop with the connector portal.',
  },
  {
    fn: 'apiMappingsList',
    scope: 'read:projects',
    title: 'List active field mappings',
    description:
      'Returns the FieldMapping translation table the BMS can preview to understand how source values become destination values.',
    body: `{ "portal": "symfonie", "field": "workflow_name" }`,
    response: `{
  "count": 3,
  "mappings": [
    { "portal": "symfonie", "field": "workflow_name", "source_value": "MTPE-light", "destination_value": "post_edit" }
  ]
}`,
  },
  {
    fn: 'apiAttachmentsList',
    scope: 'read:projects',
    title: "List a project's attachments",
    description:
      'Returns the ProjectAttachment catalog for a given project — handoff files, references, deliveries. Storage is Dropbox-backed.',
    body: `{ "project_id": "abc123" }`,
    response: `{
  "count": 2,
  "attachments": [
    { "id": "att_1", "name": "source.docx", "size": 18230, "kind": "handoff", "storage_path": "/Dispatch/.../source.docx" }
  ]
}`,
  },
  {
    fn: 'apiAttachmentsDownload',
    scope: 'read:projects',
    title: 'Get a short-lived signed download URL',
    description:
      'Returns a Dropbox signed URL good for ~4 hours. Designed for BMS jobs that pull files into their own storage immediately on receipt.',
    body: `{ "attachment_id": "att_1" }`,
    response: `{ "url": "https://dl.dropboxusercontent.com/...", "expires_in_seconds": 14400 }`,
  },
  {
    fn: 'apiSpec',
    scope: 'public',
    title: 'Machine-readable API spec (no auth)',
    description:
      'Discovery endpoint — returns the same shape this page documents, in JSON. Useful for BMS-side schema generation.',
    response: `{ "name": "Dispatch Hub — BMS Integration API", "version": "2.0.0-faz2", "...": "..." }`,
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
              Dispatch Hub exposes a small, opinionated REST-shaped API over Base44 backend functions. Every endpoint is a <code className="font-mono bg-surface-2 px-1 rounded">POST</code> that accepts a JSON body and returns a JSON body. Authentication is a single header on every call.
            </p>
            <p>
              The lifecycle of a project moves through four states: <code className="font-mono bg-surface-2 px-1 rounded">accepted → synchronized → delivered</code>, with <code className="font-mono bg-surface-2 px-1 rounded">failed_to_sync</code> as the escape hatch. Each transition emits a webhook so your BMS never has to poll.
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
              The <code className="font-mono bg-surface-2 px-1 rounded">Apikey</code> scheme is preferred and what you'll see in our examples. Revoked keys reject with <code className="font-mono bg-surface-2 px-1 rounded">401 Unauthorized</code>; missing scopes reject with <code className="font-mono bg-surface-2 px-1 rounded">403 Forbidden</code>.
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
            <div className="border border-line-1 rounded-md overflow-hidden">
              <table className="w-full text-[12.5px]">
                <thead className="bg-surface-2 text-ink-3">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Event</th>
                    <th className="text-left px-3 py-2 font-medium">Fires when</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-1">
                  <tr><td className="px-3 py-2 font-mono text-ink-1">project.accepted</td><td className="px-3 py-2 text-ink-2">A new project is accepted into Dispatch Hub from a connector.</td></tr>
                  <tr><td className="px-3 py-2 font-mono text-ink-1">project.updated</td><td className="px-3 py-2 text-ink-2">A material field (e.g. due_date) changed on an accepted project.</td></tr>
                  <tr><td className="px-3 py-2 font-mono text-ink-1">project.synchronized</td><td className="px-3 py-2 text-ink-2">BMS acknowledged the project via <code className="font-mono bg-surface-2 px-1 rounded">apiProjectsAcknowledge</code>.</td></tr>
                  <tr><td className="px-3 py-2 font-mono text-ink-1">project.delivered</td><td className="px-3 py-2 text-ink-2">BMS marked the project delivered via <code className="font-mono bg-surface-2 px-1 rounded">apiProjectsDeliver</code>.</td></tr>
                  <tr><td className="px-3 py-2 font-mono text-ink-1">project.failed_to_sync</td><td className="px-3 py-2 text-ink-2">A persistent sync error parked the project in failed_to_sync.</td></tr>
                </tbody>
              </table>
            </div>
          </DocSection>

          <DocSection id="webhook-payload" eyebrow="Webhooks" title="Payload shape">
            <p>The body posted to your URL is a JSON envelope with the event name, a delivery timestamp, and a project snapshot:</p>
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

          {/* ─────────────────────────── CAT ANALYSIS ─────────────────────────── */}
          <DocSection id="cat-analysis" eyebrow="Reference" title="CAT analysis block">
            <p>
              Every project payload (both <code className="font-mono bg-surface-2 px-1 rounded">apiProjectsList</code> and <code className="font-mono bg-surface-2 px-1 rounded">apiProjectsGet</code>) carries a <code className="font-mono bg-surface-2 px-1 rounded">cat_analysis</code> block when CAT leverage was captured at accept time. The shape is portal-neutral — bands have the same meaning whether the underlying source is Symfonie (MemSource), GlobalLink (PD), or Junction.
            </p>
            <CodeBlock language="json">{`{
  "weighted_wc": 712.4,
  "parser_type": "MemSource",
  "bands": {
    "context":     320,
    "rep":          12,
    "match100":    145,
    "fuzzy_95_99":  38,
    "fuzzy_85_94":  60,
    "fuzzy_75_84":  25,
    "fuzzy_50_74":  18,
    "rep_95_99":     0,
    "rep_85_94":     0,
    "rep_75_84":     0,
    "rep_50_74":     0,
    "no_match":    662
  }
}`}</CodeBlock>
            <div className="border border-line-1 rounded-md overflow-hidden mt-4">
              <table className="w-full text-[12.5px]">
                <thead className="bg-surface-2 text-ink-3">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Field</th>
                    <th className="text-left px-3 py-2 font-medium">Meaning</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-1">
                  <tr><td className="px-3 py-2 font-mono text-ink-1">weighted_wc</td><td className="px-3 py-2 text-ink-2">Source-of-truth weighted word count. Junction supplies this precomputed; Symfonie/GlobalLink compute it client-side via the MTPE-aligned formula.</td></tr>
                  <tr><td className="px-3 py-2 font-mono text-ink-1">parser_type</td><td className="px-3 py-2 text-ink-2">CAT tool that produced the analysis (<code className="font-mono">MemSource</code>, <code className="font-mono">Junction</code>, etc.). May be <code className="font-mono">null</code>.</td></tr>
                  <tr><td className="px-3 py-2 font-mono text-ink-1">bands.context</td><td className="px-3 py-2 text-ink-2">In-context / context-TM matches.</td></tr>
                  <tr><td className="px-3 py-2 font-mono text-ink-1">bands.rep</td><td className="px-3 py-2 text-ink-2">Pure cross-segment repetitions.</td></tr>
                  <tr><td className="px-3 py-2 font-mono text-ink-1">bands.match100</td><td className="px-3 py-2 text-ink-2">100% TM matches.</td></tr>
                  <tr><td className="px-3 py-2 font-mono text-ink-1">bands.fuzzy_*</td><td className="px-3 py-2 text-ink-2">Pure fuzzy bands (95-99 / 85-94 / 75-84 / 50-74). Repetitions falling inside a fuzzy band live in the corresponding <code className="font-mono">rep_*</code> field, not here.</td></tr>
                  <tr><td className="px-3 py-2 font-mono text-ink-1">bands.rep_*</td><td className="px-3 py-2 text-ink-2">GlobalLink-only sub-bands. Symfonie/Junction emit <code className="font-mono">0</code>.</td></tr>
                  <tr><td className="px-3 py-2 font-mono text-ink-1">bands.no_match</td><td className="px-3 py-2 text-ink-2">No-match words. Junction folds <code className="font-mono">mtPostEdit</code> into this bucket (same MTPE 0.6 weight).</td></tr>
                </tbody>
              </table>
            </div>
            <p className="text-[11.5px] text-ink-3 italic-editorial border-l-2 border-line-2 pl-3 mt-4">
              <strong className="not-italic text-ink-2">When is <code className="font-mono not-italic">cat_analysis</code> null?</strong> Older projects accepted before CAT capture landed, portals without leverage analysis attached, or rejections. Treat null as "no data" rather than "all zero" — don't divide by it.
            </p>
            <p className="text-[11.5px] text-ink-3 italic-editorial border-l-2 border-line-2 pl-3">
              <strong className="not-italic text-ink-2">Junction quirk:</strong> Junction has no 50-74 band (lowest is 75). It emits a proprietary <code className="font-mono not-italic">weighted_wc</code> precomputed from its internal pricing model — use it as-is rather than re-deriving from bands.
            </p>
          </DocSection>

          {/* ─────────────────────────── ERRORS ─────────────────────────── */}
          <DocSection id="errors" eyebrow="Reference" title="Errors">
            <p>All endpoints return errors in a consistent JSON shape:</p>
            <CodeBlock language="json">{`{ "error": "human-readable description" }`}</CodeBlock>
            <div className="border border-line-1 rounded-md overflow-hidden">
              <table className="w-full text-[12.5px]">
                <thead className="bg-surface-2 text-ink-3">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Status</th>
                    <th className="text-left px-3 py-2 font-medium">Meaning</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-1">
                  <tr><td className="px-3 py-2 font-mono text-ink-1">400</td><td className="px-3 py-2 text-ink-2">Required body field missing or malformed.</td></tr>
                  <tr><td className="px-3 py-2 font-mono text-ink-1">401</td><td className="px-3 py-2 text-ink-2">No API key, malformed header, or key revoked.</td></tr>
                  <tr><td className="px-3 py-2 font-mono text-ink-1">403</td><td className="px-3 py-2 text-ink-2">Key lacks the scope this endpoint requires.</td></tr>
                  <tr><td className="px-3 py-2 font-mono text-ink-1">404</td><td className="px-3 py-2 text-ink-2">Project / attachment id not found in your tenant.</td></tr>
                  <tr><td className="px-3 py-2 font-mono text-ink-1">409</td><td className="px-3 py-2 text-ink-2">Illegal state transition (e.g. delivering an unsynchronized project).</td></tr>
                  <tr><td className="px-3 py-2 font-mono text-ink-1">500</td><td className="px-3 py-2 text-ink-2">Unexpected server error — safe to retry with exponential backoff.</td></tr>
                </tbody>
              </table>
            </div>
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