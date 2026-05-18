// Portal × capability matrix for the BMS docs. Single source of truth so the
// Documentation page and the apiSpec function can both render it from one
// place. Each row = one BMS-observable behaviour; each cell = { state, note }.
//
// state: 'full' | 'partial' | 'none' | 'na'
//   full    → BMS can rely on this everywhere on this portal
//   partial → present but with caveats (e.g. only some accept paths)
//   none    → not wired today; field is null/empty/0
//   na      → upstream portal doesn't have the concept (so it never will)
//
// Keep notes short — they render inline in tooltips / table cells.

export const PORTAL_MATRIX = [
  {
    capability: 'cat_analysis.weighted_wc',
    label: 'Weighted Word Count',
    symfonie: { state: 'full',    note: "Symfonie native CalculatedQuantity (customer's per-band grid). Fallback formula used only when Symfonie didn't emit one." },
    junction: { state: 'full',    note: 'Junction upstream-provided. WWC formula regression-validated (TikTok program, 5 tasks, 0% fit error).' },
    globallink:{ state: 'full',   note: 'Computed client-side via MTPE-aligned formula (reps+fuzzy bands × 0.20/0.35/0.45/0.60).' },
  },
  {
    capability: 'cat_analysis.bands',
    label: 'CAT leverage bands',
    symfonie: { state: 'full',    note: '8 pure bands (context, rep, 100%, 95-99, 85-94, 75-84, 50-74, no-match). rep_* sub-bands always 0.' },
    junction: { state: 'full',    note: '6 bands + mt_post_edit (Junction-only). No 50-74 band — lowest fuzzy is 75-84.' },
    globallink:{ state: 'full',   note: '8 bands + 4 rep_* sub-bands (rep_95_99, rep_85_94, rep_75_84, rep_50_74).' },
  },
  {
    capability: 'cat_analysis.mt_post_edit',
    label: 'MT post-edit band',
    symfonie: { state: 'na',      note: 'Symfonie analyses don\'t carry an MTPE label.' },
    junction: { state: 'full',    note: 'mt_post_edit + mt_weight_coefficient (Junction TikTok default 0.70).' },
    globallink:{ state: 'na',     note: 'PD doesn\'t emit MTPE words as a distinct band.' },
  },
  {
    capability: 'vendor_payment',
    label: 'Vendor financial breakdown',
    symfonie: { state: 'full',    note: 'PurchaseOrder.Prices — partner_name + currency + USD-converted totals.' },
    junction: { state: 'none',    note: 'Not wired today. Field is null on every Junction project.' },
    globallink:{ state: 'none',   note: 'Not wired today. Field is null on every GlobalLink project.' },
  },
  {
    capability: 'project_notes',
    label: 'Project-level brief',
    symfonie: { state: 'full',    note: 'Free-text from Symfonie Project.Notes.' },
    junction: { state: 'none',    note: 'Not wired today. Field is an empty string.' },
    globallink:{ state: 'none',   note: 'Not wired today. Field is an empty string.' },
  },
  {
    capability: 'raw.account_id',
    label: 'Stable account ID',
    symfonie: { state: 'partial', note: 'Numeric Symfonie Project.Id; not a customer-stable identifier across projects.' },
    junction: { state: 'none',    note: 'Junction doesn\'t expose a stable account ID separate from project metadata.' },
    globallink:{ state: 'full',   note: 'paClientTicket — stable across submissions for the same end-client.' },
  },
  {
    capability: 'attachments',
    label: 'Handoff files (apiAttachments*)',
    symfonie: { state: 'full',    note: 'Source files downloaded to Dropbox at accept time; surfaced via apiAttachmentsList / apiAttachmentsDownload.' },
    junction: { state: 'none',    note: 'No Dropbox handoff today — attachments_count = 0.' },
    globallink:{ state: 'none',   note: 'No Dropbox handoff today — attachments_count = 0.' },
  },
  {
    capability: 'due_date_change',
    label: 'Due-date change notifications',
    symfonie: { state: 'full',    note: 'symfonieSyncAcceptedDueDates polls upstream; emits UserNotification + email when due_date shifts.' },
    junction: { state: 'none',    note: 'Not tracked. Due-date drift after accept is invisible.' },
    globallink:{ state: 'none',   note: 'Not tracked. Due-date drift after accept is invisible.' },
  },
  {
    capability: 'lifecycle_event',
    label: 'project.accepted webhook',
    symfonie: { state: 'full',    note: 'Fires on every successful accept (rule-based + manual).' },
    junction: { state: 'full',    note: 'Fires on every successful accept.' },
    globallink:{ state: 'full',   note: 'Fires on every successful claim.' },
  },
];

// Column metadata for the renderer.
export const PORTAL_COLUMNS = [
  { key: 'symfonie',   label: 'Symfonie',   sub: 'Moravia' },
  { key: 'junction',   label: 'Junction',   sub: 'Welocalize' },
  { key: 'globallink', label: 'GlobalLink', sub: 'TransPerfect PD' },
];