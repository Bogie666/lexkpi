/**
 * Translation maps between ST's raw strings and our internal dimension codes.
 *
 * ST's Accounting report returns business-unit names like "Commercial Install",
 * "HVAC Maintenance", "Plumbing Service" — fine-grained sub-divisions that
 * roll up into the 5 dashboard departments. We match by substring, priority-
 * ordered so e.g. "HVAC Maintenance" → hvac (not maintenance) and
 * "Cool Club" → maintenance.
 *
 * Anything that falls through is returned unmapped; the sync logs it so we
 * can add a rule without silently miscounting revenue.
 */

export const DEPT_CODES = ['hvac', 'plumbing', 'electrical', 'commercial', 'maintenance'] as const;
export type DepartmentCode = (typeof DEPT_CODES)[number];

/** Explicit overrides — checked first, exact match (case-insensitive after trim). */
const EXPLICIT_OVERRIDES: Record<string, DepartmentCode> = {
  // Examples; extend as real ST names surface.
  'cool club': 'maintenance',
  'comfort club': 'maintenance',
  'maintenance club': 'maintenance',
};

/** Ordered substring rules — first match wins. */
const SUBSTRING_RULES: Array<{ contains: string; code: DepartmentCode }> = [
  // "Commercial …" always wins because commercial divisions exist inside
  // multiple trades in ST — we want them counted as a single commercial bucket.
  { contains: 'commercial', code: 'commercial' },

  // Membership-club work is its own bucket.
  { contains: 'cool club', code: 'maintenance' },
  { contains: 'comfort club', code: 'maintenance' },

  // Trade buckets
  { contains: 'plumbing', code: 'plumbing' },
  { contains: 'electrical', code: 'electrical' },
  { contains: 'hvac', code: 'hvac' },

  // Generic maintenance catch-all, lowest priority so it doesn't steal
  // "HVAC Maintenance" (that matches 'hvac' above first).
  { contains: 'maintenance', code: 'maintenance' },
];

export function mapBusinessUnitToDepartment(raw: string | null): DepartmentCode | null {
  if (!raw) return null;
  const lower = raw.toLowerCase().trim();
  if (!lower) return null;

  const explicit = EXPLICIT_OVERRIDES[lower];
  if (explicit) return explicit;

  for (const rule of SUBSTRING_RULES) {
    if (lower.includes(rule.contains)) return rule.code;
  }
  return null;
}
