'use client';

import { Panel } from '@/components/primitives/panel';
import { Stat } from '@/components/primitives/stat';
import { AreaTrend, type AreaTrendPoint } from '@/components/charts/area-trend';
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
  const trendPoints: AreaTrendPoint[] = trend.map((t) => ({
    label: String(Number(t.date.slice(-2))),
    value: t.actual,
    target: t.target,
  }));

  const pctToGoal = total.percentToGoal / 100;
  const subMeta = (
    <span className="font-mono tabular-nums">
      {fmtPercent(total.percentToGoal)} of {fmtMoney(total.target)} goal · {data.meta.period}
    </span>
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
        {/* Goal progress bar */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-[12px] text-muted">
            <span className="text-eyebrow uppercase">Progress to goal</span>
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
        </div>
      </div>
      <div className="min-h-[220px] aspect-[16/9] lg:aspect-auto">
        <AreaTrend data={trendPoints} height={260} unit="cents" />
      </div>
    </Panel>
  );
}
