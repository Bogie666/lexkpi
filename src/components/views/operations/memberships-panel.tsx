'use client';

import { useMemo } from 'react';
import { Panel } from '@/components/primitives/panel';
import { Stat } from '@/components/primitives/stat';
import { ComparePill } from '@/components/primitives/compare-pill';
import { AreaTrend } from '@/components/charts/area-trend';
import { DualTrend } from '@/components/charts/dual-trend';
import { TrendLegend } from '@/components/charts/trend-legend';
import { CompareBanner } from '@/components/layout/compare-banner';
import { fmtPercent } from '@/lib/format/percent';
import { fmtCount } from '@/lib/format/count';
import { membershipsInsights } from '@/lib/insights/operations';
import type { MembershipsResponse, CompareValue } from '@/lib/types/kpi';
import type { CompareMode } from '@/lib/state/url-params';

function toStatMode(m: CompareMode): 'prev' | 'ly' | 'ly2' | 'none' {
  if (m === 'ly') return 'ly';
  if (m === 'ly2') return 'ly2';
  return 'prev';
}

function asCompareValue(current: number, ly?: number, ly2?: number): CompareValue {
  return { value: current, ly, ly2, unit: 'count' };
}

const MONTH_LABELS = ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr'];

export interface MembershipsPanelProps {
  data: MembershipsResponse;
  compareMode: CompareMode;
}

export function MembershipsPanel({ data, compareMode }: MembershipsPanelProps) {
  const compareOn = compareMode === 'ly' || compareMode === 'ly2';
  const compareYear: 'ly' | 'ly2' = compareMode === 'ly2' ? 'ly2' : 'ly';
  const statMode = toStatMode(compareMode);

  const pctToGoal = (data.active / data.goal) * 100;
  const lyAggregate = compareYear === 'ly2' ? data.ly2 : data.ly;

  const insights = useMemo(
    () => (compareOn ? membershipsInsights(data, compareYear) : []),
    [compareOn, compareYear, data],
  );

  const historyLabels = MONTH_LABELS.slice(-data.history.length);

  return (
    <div className="flex flex-col gap-6">
      {compareOn && insights.length > 0 && (
        <CompareBanner insights={insights} mode={compareYear} />
      )}

      {/* Hero */}
      <Panel className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-8 lg:gap-12" padding="cozy">
        <div className="flex flex-col justify-between gap-6 min-h-[220px]">
          <div className="flex flex-col gap-2">
            <span className="text-eyebrow uppercase text-muted">Active Cool Club members</span>
            <div className="text-display font-mono tabular-nums">{fmtCount(data.active)}</div>
            <div className="flex items-center gap-2 text-[12px] text-muted font-mono tabular-nums flex-wrap">
              <span>{fmtCount(data.goal)} goal</span>
              <span aria-hidden="true" className="h-1 w-1 rounded-full bg-border" />
              <span>{fmtPercent(Math.round(pctToGoal * 100))} to goal</span>
              {compareOn && lyAggregate ? (
                <>
                  <span aria-hidden="true" className="h-1 w-1 rounded-full bg-border" />
                  <ComparePill
                    current={data.active}
                    comparison={lyAggregate.active}
                    unit="count"
                    baseline={compareYear}
                    size="sm"
                  />
                </>
              ) : (
                <>
                  <span aria-hidden="true" className="h-1 w-1 rounded-full bg-border" />
                  <span>+{data.netMonth} net this month</span>
                </>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-[12px] text-muted">
              <span className="text-eyebrow uppercase">Progress to goal</span>
              <span className="font-mono tabular-nums">
                {fmtCount(data.active)} / {fmtCount(data.goal)}
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
        <div className="min-h-[220px] flex flex-col gap-3">
          <div className="flex-1 min-h-[180px]">
            {compareOn ? (
              <DualTrend
                data={data.history.map((v, i) => ({
                  label: historyLabels[i] ?? String(i + 1),
                  actual: v,
                  ly: data.lyHistory?.[i],
                }))}
                mode={compareYear}
                unit="count"
                height={200}
                showTarget={false}
              />
            ) : (
              <AreaTrend
                data={data.history.map((v, i) => ({
                  label: historyLabels[i] ?? String(i + 1),
                  value: v,
                }))}
                unit="count"
                height={200}
                showTarget={false}
              />
            )}
          </div>
          {compareOn && <TrendLegend mode={compareYear} showTarget={false} />}
        </div>
      </Panel>

      {/* 4-up KPIs */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Panel padding="tight">
          <Stat
            label="New this month"
            value={data.newMonth}
            unit="count"
            comparison={asCompareValue(data.newMonth, data.ly?.newMonth, data.ly2?.newMonth)}
            compareMode={statMode}
          />
        </Panel>
        <Panel padding="tight">
          <Stat label="New this week" value={data.newWeek} unit="count" />
        </Panel>
        <Panel padding="tight">
          <Stat
            label="Churn MTD"
            value={data.churnMonth}
            unit="count"
            comparison={asCompareValue(data.churnMonth, data.ly?.churnMonth, data.ly2?.churnMonth)}
            compareMode={statMode}
          />
        </Panel>
        <Panel padding="tight">
          <Stat
            label="Net MTD"
            value={data.netMonth}
            unit="count"
            comparison={asCompareValue(data.netMonth, data.ly?.netMonth, data.ly2?.netMonth)}
            compareMode={statMode}
          />
        </Panel>
      </div>

      {/* Tier breakdown */}
      <Panel
        eyebrow="Membership mix"
        title="By tier"
        right={
          <span className="text-[11px] uppercase tracking-[0.08em] text-muted">
            {compareOn ? `Δ vs ${compareYear === 'ly2' ? '2024' : 'LY'}` : `${fmtCount(data.active)} total`}
          </span>
        }
      >
        <div className="flex flex-col divide-y divide-border/60">
          {data.breakdown.map((t) => {
            const pct = (t.count / data.active) * 100;
            const color = `var(${t.colorToken})`;
            return (
              <div
                key={t.tier}
                className="grid items-center py-3 gap-3"
                style={{
                  gridTemplateColumns: '10px 1.4fr 72px minmax(0, 2fr) 72px auto',
                }}
              >
                <span
                  aria-hidden="true"
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: color }}
                />
                <span className="text-[13px] font-medium">{t.tier}</span>
                <span className="text-[12px] text-muted font-mono tabular-nums">
                  ${t.price}/mo
                </span>
                <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
                  <div
                    className="h-full transition-[width] duration-300 ease-out"
                    style={{ width: `${pct}%`, background: color }}
                  />
                </div>
                <span className="text-right text-[14px] font-mono tabular-nums font-medium">
                  {fmtCount(t.count)}
                </span>
                {compareOn && t.lyCount !== undefined ? (
                  <ComparePill
                    current={t.count}
                    comparison={t.lyCount}
                    unit="count"
                    baseline={compareYear}
                    size="sm"
                  />
                ) : (
                  <span className="text-[12px] text-muted font-mono tabular-nums w-10 text-right">
                    {pct.toFixed(0)}%
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
