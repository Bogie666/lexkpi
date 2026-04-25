'use client';

import { useMemo } from 'react';
import { Panel } from '@/components/primitives/panel';
import { Stat } from '@/components/primitives/stat';
import { ComparePill } from '@/components/primitives/compare-pill';
import { StackedBars } from '@/components/charts/stacked-bars';
import { TrendLegend } from '@/components/charts/trend-legend';
import { CompareBanner } from '@/components/layout/compare-banner';
import { cn } from '@/lib/cn';
import { fmtPercent } from '@/lib/format/percent';
import { callCenterInsights } from '@/lib/insights/operations';
import type { CallCenterResponse } from '@/lib/types/kpi';
import type { CompareMode } from '@/lib/state/url-params';

function toStatMode(m: CompareMode): 'prev' | 'ly' | 'ly2' | 'none' {
  if (m === 'ly') return 'ly';
  if (m === 'ly2') return 'ly2';
  return 'prev';
}

const RANK_CLS: Record<string, string> = {
  '1': 'bg-[color-mix(in_oklch,var(--accent)_20%,var(--surface-2))] text-accent border-accent/50',
  '2': 'bg-surface-2 text-muted border-border',
  '3': 'bg-[color-mix(in_oklch,var(--warning)_15%,var(--surface-2))] text-warning border-warning/40',
  n: 'bg-surface-2 text-muted border-border',
};

export interface CallCenterPanelProps {
  data: CallCenterResponse;
  compareMode: CompareMode;
}

export function CallCenterPanel({ data, compareMode }: CallCenterPanelProps) {
  const compareOn = compareMode === 'ly' || compareMode === 'ly2';
  const compareYear: 'ly' | 'ly2' = compareMode === 'ly2' ? 'ly2' : 'ly';
  const statMode = toStatMode(compareMode);

  const insights = useMemo(
    () => (compareOn ? callCenterInsights(data, compareYear) : []),
    [compareOn, compareYear, data],
  );

  return (
    <div className="flex flex-col gap-6">
      {compareOn && insights.length > 0 && (
        <CompareBanner insights={insights} mode={compareYear} />
      )}

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Panel padding="tight">
          <Stat
            label="Booked"
            value={data.kpis.booked.value}
            unit="count"
            comparison={data.kpis.booked}
            compareMode={statMode}
          />
        </Panel>
        <Panel padding="tight">
          <Stat
            label="Booking rate"
            value={data.kpis.bookRate.value}
            unit="bps"
            comparison={data.kpis.bookRate}
            compareMode={statMode}
          />
        </Panel>
        <Panel padding="tight">
          <Stat
            label="Avg call time"
            value={data.kpis.avgCallTime.value}
            unit="seconds"
            comparison={data.kpis.avgCallTime}
            compareMode={statMode}
          />
        </Panel>
        <Panel padding="tight">
          <Stat
            label="Abandon rate"
            value={data.kpis.abandonRate.value}
            unit="bps"
            comparison={data.kpis.abandonRate}
            compareMode={statMode}
          />
        </Panel>
      </div>

      <div className="grid gap-6 grid-cols-1 xl:grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)]">
        <Panel
          eyebrow="Today"
          title="Calls vs bookings"
          right={
            <span className="text-[11px] uppercase tracking-[0.08em] text-muted">
              {compareOn ? `Overlaid with ${compareYear === 'ly2' ? '2024' : '2025'}` : 'Hourly pacing'}
            </span>
          }
        >
          <div className="w-full aspect-[3/1] min-h-[220px]">
            <StackedBars
              data={data.hourly.map((h) => ({
                label: h.hr,
                total: h.calls,
                highlighted: h.booked,
                lyTotal: h.lyCalls,
                lyHighlighted: h.lyBooked,
              }))}
              compareMode={compareMode}
              highlightedLabel="Booked"
              totalLabel="Calls"
            />
          </div>
          {compareOn && <TrendLegend mode={compareYear} showTarget={false} className="mt-3" />}
        </Panel>

        <Panel
          eyebrow="Leaderboard"
          title="Agents"
          right={
            compareOn ? (
              <span className="text-[11px] uppercase tracking-[0.08em] text-muted">
                Rate · Δ vs {compareYear === 'ly2' ? '2024' : 'LY'}
              </span>
            ) : null
          }
        >
          <ul className="flex flex-col divide-y divide-border/60">
            {data.agents.map((a, i) => {
              const rankKey = i < 3 ? String(i + 1) : 'n';
              return (
                <li key={a.name} className="flex items-center gap-3 py-2.5">
                  <span
                    className={cn(
                      'inline-flex items-center justify-center h-6 w-9 rounded-pill border text-[11px] font-mono tabular-nums font-medium shrink-0',
                      RANK_CLS[rankKey],
                    )}
                  >
                    #{i + 1}
                  </span>
                  <span className="text-[13px] font-medium truncate flex-1 min-w-0">{a.name}</span>
                  {compareOn && a.lyRate !== undefined ? (
                    <span className="flex items-center gap-2">
                      <span className="font-mono tabular-nums text-[13px]">
                        {fmtPercent(a.rate, { decimals: 0 })}
                      </span>
                      <ComparePill
                        current={a.rate}
                        comparison={a.lyRate}
                        unit="bps"
                        baseline={compareYear}
                        size="sm"
                      />
                    </span>
                  ) : (
                    <span className="font-mono tabular-nums text-[13px] text-muted">
                      {a.booked}/{a.calls} · {fmtPercent(a.rate, { decimals: 0 })}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
