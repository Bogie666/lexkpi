/**
 * Resolve a period preset (or explicit from/to) into a YYYY-MM-DD range plus
 * the LY and LY2 shifted windows for compare mode.
 *
 * Dates are treated as calendar dates with no time component — the DB column
 * is `date`, not `timestamp`, so this is simple string math, no timezones.
 */

export type Preset =
  | 'today'
  | 'l7'
  | 'mtd'
  | 'qtd'
  | 'ytd'
  | 'l30'
  | 'l90'
  | 'ttm'
  | 'last_month';

export interface Window {
  from: string; // inclusive, YYYY-MM-DD
  to: string;   // inclusive, YYYY-MM-DD
}

export interface ResolvedPeriod {
  cur: Window;
  ly: Window;
  ly2: Window;
  preset?: Preset;
}

function iso(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseIso(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

function addYears(d: Date, n: number): Date {
  const x = new Date(d);
  x.setUTCFullYear(x.getUTCFullYear() + n);
  return x;
}

function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}
function endOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
}
function startOfQuarter(d: Date): Date {
  const q = Math.floor(d.getUTCMonth() / 3);
  return new Date(Date.UTC(d.getUTCFullYear(), q * 3, 1));
}
function startOfYear(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
}

function windowFor(preset: Preset, today: Date): Window {
  switch (preset) {
    case 'today':
      return { from: iso(today), to: iso(today) };
    case 'l7':
      return { from: iso(addDays(today, -6)), to: iso(today) };
    case 'mtd':
      return { from: iso(startOfMonth(today)), to: iso(today) };
    case 'qtd':
      return { from: iso(startOfQuarter(today)), to: iso(today) };
    case 'ytd':
      return { from: iso(startOfYear(today)), to: iso(today) };
    case 'l30':
      return { from: iso(addDays(today, -29)), to: iso(today) };
    case 'l90':
      return { from: iso(addDays(today, -89)), to: iso(today) };
    case 'ttm':
      return { from: iso(addYears(today, -1)), to: iso(today) };
    case 'last_month': {
      const prev = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
      return { from: iso(startOfMonth(prev)), to: iso(endOfMonth(prev)) };
    }
  }
}

/** Shift a window by `years` whole years (same month/day when possible). */
function shiftYears(w: Window, years: number): Window {
  return {
    from: iso(addYears(parseIso(w.from), years)),
    to: iso(addYears(parseIso(w.to), years)),
  };
}

export interface ResolveArgs {
  preset?: string | null;
  from?: string | null;
  to?: string | null;
  /** Override "today" — used in tests and when the server clock drifts. */
  today?: Date;
}

/**
 * Resolve a period spec into a concrete date window plus its LY / LY2 siblings.
 * Explicit `from`/`to` override `preset`. Default is MTD.
 */
export function resolvePeriod(args: ResolveArgs = {}): ResolvedPeriod {
  const today = args.today ?? new Date();
  if (args.from && args.to) {
    const cur: Window = { from: args.from, to: args.to };
    return { cur, ly: shiftYears(cur, -1), ly2: shiftYears(cur, -2) };
  }

  const preset = ((args.preset ?? 'mtd') as Preset) satisfies Preset;
  const cur = windowFor(preset, today);
  return {
    cur,
    ly: shiftYears(cur, -1),
    ly2: shiftYears(cur, -2),
    preset,
  };
}

/**
 * Build the ordered list of date strings in a window. Handy for filling
 * chart series with zeros where a day had no rows.
 */
export function daysInWindow(w: Window): string[] {
  const start = parseIso(w.from);
  const end = parseIso(w.to);
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(iso(d));
  return out;
}
