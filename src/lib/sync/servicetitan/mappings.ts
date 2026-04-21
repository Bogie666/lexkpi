/**
 * ServiceTitan BusinessUnit → dashboard department.
 *
 * Source of truth: the explicit list provided by the Lex team. Matches are
 * exact (case-insensitive after trim) so no surprises — anything missing
 * falls through to `null` and gets reported in `unmappedBusinessUnits` on
 * the next sync so we can add a line here.
 *
 * To edit: add a new line to BU_TO_DEPT below. No other code needs to change.
 */

export const DEPT_CODES = [
  'hvac_service',
  'hvac_sales',
  'hvac_maintenance',
  'plumbing',
  'commercial',
  'electrical',
] as const;
export type DepartmentCode = (typeof DEPT_CODES)[number];

/** Lowercased, trimmed name → department code. null means drop. */
const BU_TO_DEPT: Record<string, DepartmentCode | null> = {
  // ── HVAC Service ──────────────────────────────────────────────────────
  'lex service':               'hvac_service',
  'lyons service':             'hvac_service',

  // ── HVAC Sales ────────────────────────────────────────────────────────
  'lex install - equipment':               'hvac_sales',
  'lex sales':                              'hvac_sales',
  'lex install - ducts & insulation':       'hvac_sales',
  'lyons sales':                            'hvac_sales',
  'lyons install - ducts & insulation':     'hvac_sales',
  'lyons install - equipment':              'hvac_sales',

  // ── HVAC Maintenance ──────────────────────────────────────────────────
  'lex maintenance':           'hvac_maintenance',
  'lyons maintenance':         'hvac_maintenance',

  // ── Plumbing ──────────────────────────────────────────────────────────
  'plumbing service':          'plumbing',
  'plumbing maintenance':      'plumbing',
  'plumbing install':          'plumbing',

  // ── Commercial ────────────────────────────────────────────────────────
  'commercial install':        'commercial',
  'commercial sales':          'commercial',
  'commercial service':        'commercial',
  'commercial maintenance':    'commercial',

  // ── Electrical ────────────────────────────────────────────────────────
  'electrical maintenance':    'electrical',
  'electrical service':        'electrical',

  // ── Explicitly dropped ────────────────────────────────────────────────
  'etx install - ducts & insulation': null,
  'etx maintenance':                  null,
  'etx service':                      null,
  'etx install - equipment':          null,
  'etx sales':                        null,
  'service star':                     null,
};

export function mapBusinessUnitToDepartment(raw: string | null): DepartmentCode | null {
  if (!raw) return null;
  const key = raw.toLowerCase().trim().replace(/\s+/g, ' ');
  if (!(key in BU_TO_DEPT)) return null;
  return BU_TO_DEPT[key];
}

/** For admin-panel introspection: list every explicit mapping. */
export function listBusinessUnitMappings(): Array<{ bu: string; dept: DepartmentCode | null }> {
  return Object.entries(BU_TO_DEPT).map(([bu, dept]) => ({ bu, dept }));
}
