'use client';

import { Panel } from '@/components/primitives/panel';
import { Stat } from '@/components/primitives/stat';
import { AreaTrend, type AreaTrendPoint } from '@/components/charts/area-trend';
import { DualTrend, type DualTrendPoint } from '@/components/charts/dual-trend';
import { TrendLegend } from '@/components/charts/trend-legend';
import { fmtMoney } from '@/lib/format/money';
import { fmtPercent } from '@/lib/format/percent';
import type { FinancialResponse } from '@/lib/types/kpi';
import type { CompareMode } from '@/lib/state/url-params';

export interface FinancialHeroProps {
  data: FinancialResponse;
  compareMode: CompareMode;
}

function compareModeToStat(m: CompareMode): 'prev' | 'ly' | 'ly2' | 'none' {
  if (m === 'prev') return 'prev';
  if (m === 'ly') return 'ly';
  if (m === 'ly2') return 'ly2';
  return 'prev';
}

export function FinancialHero({ data, compareMode }: FinancialHeroProps) {
  const { total, trend } = data;
  const compareOn = compareMode === 'ly' || compareMode === 'ly2';
  const compareYear: 'ly' | 'ly2' = compareMode === 'ly2' ? 'ly2' : 'ly';

  const pctToGoal = total.percentToGoal / 100;
  const fullTarget = total.fullPeriodTarget;
  // Only call out the full-period goal when it's meaningfully larger than
  // the pace-adjusted figure — for last_month / fully-elapsed windows the
  // two values are identical and the second pill would be noise.
  const showFullPeriod = fullTarget > 0 && fullTarget > total.target * 1.01;
  const fullPeriodLabel =
    data.meta.period === 'YTD'
      ? 'Annual goal'
      : data.meta.period === 'QTD'
        ? 'Quarter goal'
        : 'Monthly goal';
  const subMeta = (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono tabular-nums">
      <span>
        {fmtPercent(total.percentToGoal)} of {fmtMoney(total.target)} daily pace ·{' '}
        {data.meta.period}
      </span>
      {showFullPeriod && (
        <>
          <span aria-hidden="true" className="h-1 w-1 rounded-full bg-border" />
          <span className="text-muted">
            {fullPeriodLabel}: {fmtMoney(fullTarget)}
          </span>
        </>
      )}
    </span>
  );

  // X-axis label strategy: short windows show day-of-month; long windows
  // (~60+ days) show abbreviated months on the 1st of each month and blank
  // otherwise, so the user sees "Jan / Feb / Mar / Apr" instead of a wall
  // of day numbers when YTD/QTD/TTM/L90 is active.
  const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const longWindow = trend.length > 60;
  const dayLabel = (t: (typeof trend)[number]) => String(Number(t.date.slice(-2)));
  const monthLabel = (t: (typeof trend)[number]) => {
    const day = Number(t.date.slice(-2));
    if (day !== 1) return '';
    const monthIdx = Number(t.date.slice(5, 7)) - 1;
    return MONTH_ABBR[monthIdx] ?? '';
  };
  const xLabel = (t: (typeof trend)[number]) =>
    longWindow ? monthLabel(t) : dayLabel(t);
  const hoverLabel = (t: (typeof trend)[number]) => {
    const monthIdx = Number(t.date.slice(5, 7)) - 1;
    const day = Number(t.date.slice(-2));
    return `${MONTH_ABBR[monthIdx] ?? ''} ${day}`;
  };

  const chart = compareOn ? (
    <div className="flex flex-col gap-3 h-full">
      <div className="flex-1 min-h-[220px]">
        <DualTrend
          data={
            trend.map((t) => ({
              label: xLabel(t),
              hoverLabel: hoverLabel(t),
              actual: t.actual,
              ly: t.ly,
              ly2: t.ly2,
              target: t.target,
            })) satisfies DualTrendPoint[]
          }
          mode={compareYear}
          unit="cents"
          height={260}
        />
      </div>
      <TrendLegend mode={compareYear} />
    </div>
  ) : (
    <div className="h-[240px] sm:h-[280px] lg:h-auto lg:min-h-[220px]">
      <AreaTrend
        data={
          trend.map((t) => ({
            label: xLabel(t),
            hoverLabel: hoverLabel(t),
            value: t.actual,
            target: t.target,
          })) satisfies AreaTrendPoint[]
        }
        height={260}
        unit="cents"
        valueLabel="Revenue"
      />
    </div>
  );

  return (
    <Panel className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-8 lg:gap-12" padding="cozy">
      <div className="flex flex-col justify-between gap-6 min-h-[220px]">
        <Stat
          label="Total revenue"
          value={total.revenue.value}
          unit="cents"
          comparison={total.revenue}
          compareMode={compareModeToStat(compareMode)}
          emphasis="hero"
          sub={subMeta}
        />
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-[12px] text-muted">
            <span className="text-eyebrow uppercase">Daily pace</span>
            <span className="font-mono tabular-nums">
              {fmtMoney(total.revenue.value)} / {fmtMoney(total.target)}
            </span>
          </div>
          <div className="h-1.5 w-full bg-surface-2 rounded-full overflow-hidden">
            <div
              className="h-full bg-accent transition-[width] duration-300 ease-out"
              style={{ width: `${Math.min(pctToGoal, 100)}%` }}
            />
          </div>
          {showFullPeriod && (
            <div className="flex items-center justify-between text-[11px] text-muted/80 mt-1">
              <span className="text-eyebrow uppercase">{fullPeriodLabel}</span>
              <span className="font-mono tabular-nums">
                {fmtMoney(fullTarget)}{' '}
                <span className="text-muted/60">
                  ({fmtPercent(fullTarget > 0 ? Math.round((total.revenue.value / fullTarget) * 10000) : 0)})
                </span>
              </span>
            </div>
          )}
        </div>
      </div>
      {chart}
    </Panel>
  );
}
