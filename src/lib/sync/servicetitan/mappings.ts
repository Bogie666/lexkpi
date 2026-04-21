/**
 * Translation maps between ST's raw strings and our internal dimension codes.
 * Inline for now — when we build the admin panel these move to dimension tables.
 */

/**
 * ServiceTitan Business Unit → internal department code.
 *
 * ST typically returns business-unit names like "Lex HVAC Service" or
 * "Lex - HVAC Service". Keys are matched case-insensitively and trimmed.
 * Unmapped units fall through to the raw-string lookup; if still unmapped
 * the sync logs it and drops the row so we don't silently miscount revenue.
 */
const BU_MAP_RAW: Record<string, string> = {
  // HVAC variants
  'hvac service': 'hvac',
  'hvac replacement': 'hvac',
  'hvac install': 'hvac',
  'hvac repair': 'hvac',
  hvac: 'hvac',

  // Plumbing
  plumbing: 'plumbing',
  'plumbing service': 'plumbing',

  // Electrical
  electrical: 'electrical',
  'electrical service': 'electrical',

  // Commercial HVAC
  'commercial hvac': 'commercial',
  commercial: 'commercial',

  // Maintenance (Cool Club, tune-ups, etc.)
  maintenance: 'maintenance',
  'maintenance - hvac': 'maintenance',
  'cool club': 'maintenance',
};

function normalize(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/^lex\s*[-·:]?\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Returns the internal department code, or null if we should drop the row. */
export function mapBusinessUnitToDepartment(raw: string | null): string | null {
  if (!raw) return null;
  const key = normalize(raw);
  return BU_MAP_RAW[key] ?? null;
}

export const KNOWN_DEPARTMENT_CODES = [
  'hvac',
  'plumbing',
  'electrical',
  'commercial',
  'maintenance',
] as const;
