/**
 * Small date helpers for sync windows. Distinct from period.ts (which is for
 * user-facing KPI queries) to keep concerns separate.
 */

export interface SyncWindow {
  from: string; // YYYY-MM-DD inclusive
  to: string;   // YYYY-MM-DD inclusive
}

function iso(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

/** Last N calendar days ending at `to` (default = today UTC). */
export function trailingDays(days: number, to: Date = new Date()): SyncWindow {
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));
  return { from: iso(addDays(end, -(days - 1))), to: iso(end) };
}
