// Catalogue of source fields available for Google-Sheets column mapping.
// We merge the standard AcceptedTask fields with whatever portal-specific
// rule_fields the user has defined on the Portal record. Anything that exists
// on the AcceptedTask row at sync time can be mapped to a sheet column.

export const STANDARD_FIELDS = [
  { name: 'task_id',         label: 'Task ID' },
  { name: 'task_name',       label: 'Task name' },
  { name: 'project_name',    label: 'Project name' },
  { name: 'client_name',     label: 'Client / account' },
  // Friendly variants — resolved at sync time from the FriendlyName entity.
  // Fall through to the raw name if no rumuz exists for the value.
  { name: 'friendly_client_name',   label: 'Friendly · Client' },
  { name: 'friendly_account_name',  label: 'Friendly · Account' },
  { name: 'friendly_project_name',  label: 'Friendly · Project' },
  { name: 'friendly_workflow_name', label: 'Friendly · Workflow' },
  { name: 'source_language', label: 'Source language' },
  { name: 'target_language', label: 'Target language' },
  { name: 'word_count',      label: 'Word count' },
  { name: 'price',           label: 'Price' },
  { name: 'due_date',        label: 'Due date' },
  { name: 'accepted_at',     label: 'Accepted at' },
  { name: 'matched_rule',    label: 'Matched rule' },
  { name: 'portal',          label: 'Portal' },
  { name: 'status',          label: 'Status' },
  // GlobalLink leverage bands — populated by globallinkApproveOne onto every
  // AcceptedTask. Exposed here so vendors can map them to their own sheet
  // schemas (often combining fuzzy + reps bands via source_field_2).
  { name: 'weighted_wc',     label: 'Weighted WC (WWC)' },
  { name: 'lev_context',     label: 'Leverage \u00b7 In-context' },
  { name: 'lev_rep',         label: 'Leverage \u00b7 Repetitions' },
  { name: 'lev_match100',    label: 'Leverage \u00b7 100%' },
  { name: 'lev_9599',        label: 'Leverage \u00b7 95-99% (fuzzy)' },
  { name: 'lev_8594',        label: 'Leverage \u00b7 85-94% (fuzzy)' },
  { name: 'lev_7584',        label: 'Leverage \u00b7 75-84% (fuzzy)' },
  { name: 'lev_5074',        label: 'Leverage \u00b7 50-74% (fuzzy)' },
  { name: 'lev_rep_9599',    label: 'Leverage \u00b7 Reps 95-99%' },
  { name: 'lev_rep_8594',    label: 'Leverage \u00b7 Reps 85-94%' },
  { name: 'lev_rep_7584',    label: 'Leverage \u00b7 Reps 75-84%' },
  { name: 'lev_rep_5074',    label: 'Leverage \u00b7 Reps 50-74%' },
  { name: 'lev_no_match',    label: 'Leverage \u00b7 No match' },
  { name: 'deadline_at',     label: 'Phase deadline' },
  { name: 'phase_name',      label: 'Phase name' },
  { name: 'workflow_name',   label: 'Workflow' },
  { name: 'submission_id',   label: 'Submission ID' },
  { name: 'submission_ticket', label: 'Submission ticket' },
  { name: 'account_id',      label: 'Account ID' },
  // Symfonie-specific enrichment (populated by symfonieProcessTasks /
  // symfonieAcceptTask via /WordCountAnalyses + /Jobs + /Projects + /Users).
  { name: 'symfonie_link',   label: 'Symfonie link' },
  { name: 'symfonie_code',   label: 'Symfonie code' },
  { name: 'parser_type',     label: 'Parser type (CAT)' },
  { name: 'order_date',      label: 'Order date' },
  { name: 'job_id',          label: 'Job ID' },
  { name: 'job_identifier',  label: 'Job identifier (ERP)' },
  { name: 'project_id',      label: 'Project ID (Symfonie)' },
  { name: 'project_manager_first_name', label: 'PM first name' },
  { name: 'project_manager_last_name',  label: 'PM last name' },
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