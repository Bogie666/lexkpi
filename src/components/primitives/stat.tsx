import { cn } from '@/lib/cn';
import { fmtMoney } from '@/lib/format/money';
import { fmtCount, fmtSeconds } from '@/lib/format/count';
import { fmtPercent } from '@/lib/format/percent';
import type { CompareValue, Unit } from '@/lib/types/kpi';
import { DeltaPill, type DeltaFormat } from './delta-pill';
import { ComparePill } from './compare-pill';

export interface StatProps {
  label: string;
  value: number;
  unit: Unit;
  /** Pass through the full CompareValue to show a delta/compare pill. */
  comparison?: CompareValue;
  compareMode?: 'prev' | 'ly' | 'ly2' | 'none';
  emphasis?: 'default' | 'hero';
  className?: string;
  sub?: React.ReactNode;
}

function formatValue(value: number, unit: Unit, emphasis: 'default' | 'hero'): string {
  const abbreviate = emphasis !== 'hero' || unit === 'count';
  switch (unit) {
    case 'cents':
      return fmtMoney(value, { abbreviate });
    case 'bps':
      return fmtPercent(value);
    case 'seconds':
      return fmtSeconds(value);
    case 'count':
    default:
      return fmtCount(value, { abbreviate: emphasis !== 'hero' });
  }
}

function deltaFormatForUnit(unit: Unit): DeltaFormat {
  switch (unit) {
    case 'cents':
      return 'money';
    case 'bps':
      return 'points';
    case 'count':
      return 'count';
    case 'seconds':
      return 'count';
  }
}

export function Stat({
  label,
  value,
  unit,
  comparison,
  compareMode = 'prev',
  emphasis = 'default',
  className,
  sub,
}: StatProps) {
  const body = formatValue(value, unit, emphasis);

  // Pick the comparison baseline based on compareMode.
  let pill: React.ReactNode = null;
  if (comparison && compareMode !== 'none') {
    if (compareMode === 'prev' && comparison.prev !== undefined) {
      pill = <DeltaPill current={value} previous={comparison.prev} format={deltaFormatForUnit(unit)} />;
    } else if (compareMode === 'ly' && comparison.ly !== undefined) {
      pill = <ComparePill current={value} comparison={comparison.ly} unit={unit} baseline="ly" />;
    } else if (compareMode === 'ly2' && comparison.ly2 !== undefined) {
      pill = <ComparePill current={value} comparison={comparison.ly2} unit={unit} baseline="ly2" />;
    }
  }

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <span className="text-eyebrow uppercase text-muted">{label}</span>
      <div className="flex items-baseline gap-3 flex-wrap">
        <span
          className={cn(
            'font-mono tabular-nums',
            emphasis === 'hero' ? 'text-display' : 'text-kpi',
          )}
        >
          {body}
        </span>
        {pill}
      </div>
      {sub && <div className="text-[12px] text-muted">{sub}</div>}
    </div>
  );
}
