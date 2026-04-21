export function fmtAsOf(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const time = d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return `${date} · ${time}`;
}

export function fmtDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export const PRESET_LABELS: Record<string, string> = {
  today: 'Today',
  l7: 'Last 7',
  mtd: 'MTD',
  qtd: 'QTD',
  ytd: 'YTD',
  l30: 'L30',
  l90: 'L90',
  ttm: 'TTM',
  last_month: 'Last month',
};
