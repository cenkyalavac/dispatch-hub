// Single source of truth for per-portal rule/mapping/routing field vocabularies.
//
// Reads `portal.rule_fields` if present (canonical); otherwise falls back to
// hard-coded defaults that mirror what each portal's fetch function actually
// returns. The fallback exists so a fresh portal record without rule_fields
// still works — but the Settings tab lets the user override it per portal.
//
// Field shape:
//   { name, label, type: 'string'|'number', operators: string[] }
//
// Operators:
//   text     → contains, not_contains, equals, starts_with
//   numeric  → greater_than, less_than, greater_equal, less_equal, equals

const TEXT_OPS = ['contains', 'not_contains', 'equals', 'starts_with'];
const NUM_OPS  = ['greater_than', 'less_than', 'greater_equal', 'less_equal', 'equals'];

const t = (name, label) => ({ name, label, type: 'string', operators: TEXT_OPS });
const n = (name, label) => ({ name, label, type: 'number', operators: NUM_OPS });

// Defaults per portal — used when Portal.rule_fields is empty/missing.
export const DEFAULT_FIELDS = {
  symfonie: [
    t('project_name', 'Project name'),
    t('task_name', 'Task name'),
    t('workflow_name', 'Workflow'),
    t('source_language', 'Source language'),
    t('target_language', 'Target language'),
    t('client_name', 'Client'),
    n('word_count', 'Word count'),
    n('price', 'Price'),
    t('project_manager_first_name', 'PM first name'),
    t('project_manager_last_name', 'PM last name'),
  ],
  junction: [
    t('task_name', 'Task name'),
    t('source_language', 'Source language'),
    t('target_language', 'Target language'),
    t('client_name', 'Client'),
    n('word_count', 'Word count'),
    n('price', 'Price'),
  ],
  globallink: [
    t('submission_id', 'Submission ID'),
    t('submission_ticket', 'Submission ticket'),
    t('project_name', 'Submission name'),
    t('client_name', 'Client'),
    t('source_language', 'Source language'),
    t('target_language', 'Target language'),
    t('phase_name', 'Phase'),
    t('workflow_name', 'Workflow'),
    n('word_count', 'Word count'),
    n('weighted_wc', 'Weighted WC (WWC)'),
    n('lev_context', 'In-context match'),
    n('lev_rep', 'Repetitions'),
    n('lev_match100', '100% match'),
    n('lev_9599', '95-99%'),
    n('lev_8594', '85-94%'),
    n('lev_7584', '75-84%'),
    n('lev_5074', '50-74%'),
    n('lev_no_match', 'No match'),
    t('deadline_at', 'Phase deadline'),
    t('due_date', 'Due date'),
  ],
};

// Minimal fallback when a portal isn't in DEFAULT_FIELDS and has no rule_fields.
const GENERIC_FALLBACK = [
  t('project_name', 'Project name'),
  t('client_name', 'Client'),
  t('source_language', 'Source language'),
  t('target_language', 'Target language'),
  n('word_count', 'Word count'),
];

// Operator label table — single place to localize/format operator names.
export const OPERATOR_LABELS = {
  contains: 'contains',
  not_contains: 'does not contain',
  equals: 'equals',
  starts_with: 'starts with',
  greater_than: '>',
  less_than: '<',
  greater_equal: '≥',
  less_equal: '≤',
};

// Returns the canonical field list for a portal.
// Priority: portal.rule_fields → DEFAULT_FIELDS[key] → GENERIC_FALLBACK
export function getFieldsForPortal(portal) {
  if (!portal) return GENERIC_FALLBACK;
  if (Array.isArray(portal.rule_fields) && portal.rule_fields.length > 0) {
    return portal.rule_fields.map((f) => ({
      name: f.name,
      label: f.label || f.name,
      type: f.type === 'number' ? 'number' : 'string',
      operators: Array.isArray(f.operators) && f.operators.length > 0
        ? f.operators
        : (f.type === 'number' ? NUM_OPS : TEXT_OPS),
    }));
  }
  return DEFAULT_FIELDS[portal.key] || GENERIC_FALLBACK;
}

export function getFieldByName(fields, name) {
  return fields.find((f) => f.name === name) || null;
}