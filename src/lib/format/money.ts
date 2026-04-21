export interface FmtMoneyOpts {
  abbreviate?: boolean;
  cents?: boolean;
}

export function fmtMoney(cents: number, opts: FmtMoneyOpts = {}): string {
  const { abbreviate = true, cents: withCents = false } = opts;
  const dollars = cents / 100;
  const abs = Math.abs(dollars);

  if (abbreviate && abs >= 1_000_000) {
    return `${dollars < 0 ? '-' : ''}$${(abs / 1_000_000).toFixed(1)}M`;
  }
  if (abbreviate && abs >= 1_000) {
    return `${dollars < 0 ? '-' : ''}$${Math.round(abs / 1_000)}K`;
  }
  return `$${dollars.toLocaleString('en-US', {
    minimumFractionDigits: withCents ? 2 : 0,
    maximumFractionDigits: withCents ? 2 : 0,
  })}`;
}

/** Full money, always two decimals, with commas. Used where precision matters. */
export function fmtMoneyFull(cents: number): string {
  return fmtMoney(cents, { abbreviate: false, cents: true });
}
