export function fmtCount(n: number, opts: { abbreviate?: boolean } = {}): string {
  const { abbreviate = false } = opts;
  const abs = Math.abs(n);
  if (abbreviate && abs >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1)}M`;
  }
  if (abbreviate && abs >= 10_000) {
    return `${Math.round(n / 1_000)}K`;
  }
  return n.toLocaleString('en-US');
}

export function fmtSeconds(s: number): string {
  if (s < 60) return `${Math.round(s)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s % 60);
  return rem === 0 ? `${m}m` : `${m}m ${rem}s`;
}
