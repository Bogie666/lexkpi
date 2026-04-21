import { Pill } from './pill';
import { fmtMoney } from '@/lib/format/money';
import { fmtCount } from '@/lib/format/count';

export type DeltaFormat = 'money' | 'percent' | 'count' | 'points';

export interface DeltaPillProps {
  current: number;
  previous: number | null | undefined;
  format?: DeltaFormat;
  size?: 'sm' | 'md';
}

const ARROW = { up: '▲', down: '▼', flat: '–' } as const;

export function DeltaPill({ current, previous, format = 'percent', size = 'sm' }: DeltaPillProps) {
  if (previous === null || previous === undefined) return null;
  if (previous === 0 && current === 0) return null;

  const diff = current - previous;
  const pct = previous === 0 ? 0 : (diff / Math.abs(previous)) * 100;
  const tone = diff > 0 ? 'up' : diff < 0 ? 'down' : 'default';
  const arrow = diff > 0 ? ARROW.up : diff < 0 ? ARROW.down : ARROW.flat;
  const sign = diff > 0 ? '+' : '';

  let body: string;
  switch (format) {
    case 'money':
      body = `${sign}${fmtMoney(diff, { abbreviate: true })}`;
      break;
    case 'count':
      body = `${sign}${fmtCount(diff)}`;
      break;
    case 'points':
      body = `${sign}${(diff / 100).toFixed(1)} pts`;
      break;
    case 'percent':
    default:
      body = `${sign}${pct.toFixed(1)}%`;
      break;
  }

  return (
    <Pill tone={tone} size={size}>
      <span aria-hidden="true" className="text-[9px]">{arrow}</span>
      {body}
    </Pill>
  );
}
