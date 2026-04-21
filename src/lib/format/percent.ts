export interface FmtPercentOpts {
  decimals?: number;
  sign?: boolean;
}

/** bps = basis points (0..10000 = 0.00%..100.00%) */
export function fmtPercent(bps: number, opts: FmtPercentOpts = {}): string {
  const { decimals = 1, sign = false } = opts;
  const n = bps / 100;
  const body = `${n.toFixed(decimals)}%`;
  if (!sign) return body;
  return n > 0 ? `+${body}` : body;
}

/** Raw percent already expressed as a number (e.g. 42.8 -> "42.8%"). */
export function fmtPercentRaw(pct: number, decimals = 1): string {
  return `${pct.toFixed(decimals)}%`;
}
