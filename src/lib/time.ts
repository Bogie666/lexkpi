/**
 * Business-local date helpers. The dashboard is for a Texas company
 * (Service Star Brands / Lexington), so "today" means today in
 * America/Chicago — not UTC. Using `toISOString().slice(0,10)` rolls
 * the date over at 6/7pm local time, which would mark "tomorrow" as
 * "today" on the appointments page after dinner.
 */

export const BUSINESS_TZ = 'America/Chicago';

/** Today (YYYY-MM-DD) in the business timezone. */
export function localTodayISO(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  // 'en-CA' formats as YYYY-MM-DD already.
  return parts;
}

/** Shift a YYYY-MM-DD string by `days` (positive or negative). */
export function shiftISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}
