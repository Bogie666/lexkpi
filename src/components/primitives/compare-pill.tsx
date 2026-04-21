import { Pill } from './pill';
import { fmtMoney } from '@/lib/format/money';
import { fmtCount } from '@/lib/format/count';
import type { Unit } from '@/lib/types/kpi';

export interface ComparePillProps {
  current: number;
  comparison: number;
  unit: Unit;
  baseline?: 'prev' | 'ly' | 'ly2';
  size?: 'sm' | 'md';
}

export function ComparePill({ current, comparison, unit, size = 'sm' }: ComparePillProps) {
  const diff = current - comparison;
  const pct = comparison === 0 ? 0 : (diff / Math.abs(comparison)) * 100;
  const tone = diff > 0 ? 'up' : diff < 0 ? 'down' : 'default';
  const arrow = diff > 0 ? '▲' : diff < 0 ? '▼' : '–';
  const sign = diff > 0 ? '+' : '';

  let absStr: string;
  switch (unit) {
    case 'cents':
      absStr = `${sign}${fmtMoney(diff, { abbreviate: true })}`;
      break;
    case 'bps':
      absStr = `${sign}${(diff / 100).toFixed(1)} pts`;
      break;
    case 'seconds':
      absStr = `${sign}${Math.round(diff)}s`;
      break;
    case 'count':
    default:
      absStr = `${sign}${fmtCount(diff)}`;
      break;
  }
  const pctStr = `${sign}${pct.toFixed(1)}%`;

  return (
    <Pill tone={tone} size={size}>
      <span aria-hidden="true" className="text-[9px]">{arrow}</span>
      {absStr}
      <span className="opacity-60">·</span>
      {pctStr}
    </Pill>
  );
}
