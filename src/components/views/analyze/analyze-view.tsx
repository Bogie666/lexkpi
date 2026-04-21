'use client';

import { useDashboardParams } from '@/lib/state/url-params';
import { useEstimates } from '@/lib/hooks/use-estimates';
import { SectionHead } from '@/components/primitives/section-head';
import { Panel } from '@/components/primitives/panel';
import { Skeleton } from '@/components/primitives/skeleton';
import { Stat } from '@/components/primitives/stat';
import { ComboChart } from '@/components/charts/combo-chart';
import { fmtMoney } from '@/lib/format/money';
import { fmtPercent } from '@/lib/format/percent';
import { fmtAsOf } from '@/lib/format/date';
import type { AnalyzeResponse } from '@/lib/types/kpi';

const TIER_LABEL: Record<string, string> = {
  low: 'Low',
  mid: 'Mid',
  high: 'High',
};

const TTC_LABEL: Record<string, string> = {
  same_day: 'Same day',
  one_to_7: '1–7 days',
  over_7: '8+ days',
};

export function AnalyzeView() {
  const [params] = useDashboardParams();
  const { data, isLoading, error, refetch } = useEstimates(params);

  return (
    <div className="flex flex-col gap-6">
      <SectionHead
        eyebrow="Analyze"
        title="Estimate analysis"
        right={
          data && (
            <span className="text-meta font-mono text-muted hidden md:inline">
              Last 12 months · as of {fmtAsOf(data.meta.asOf)}
            </span>
          )
        }
      />

      {isLoading && <AnalyzeSkeleton />}

      {error && !isLoading && (
        <Panel>
          <div className="flex flex-col items-start gap-3">
            <div className="text-panel">Couldn&apos;t load estimate data</div>
            <button
              onClick={() => refetch()}
              className="text-[13px] font-medium px-3 py-1.5 rounded-btn bg-surface-2 hover:bg-surface-2/80 transition-colors"
            >
              Retry
            </button>
          </div>
        </Panel>
      )}

      {data && <AnalyzeContent data={data} />}
    </div>
  );
}

function AnalyzeSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Panel key={i} padding="tight">
            <Skeleton variant="stat" />
          </Panel>
        ))}
      </div>
      <Panel padding="cozy">
        <Skeleton variant="chart" />
      </Panel>
    </div>
  );
}

function AnalyzeContent({ data }: { data: AnalyzeResponse }) {
  return (
    <>
      {/* KPI strip */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Panel padding="tight">
          <Stat label="Opportunities" value={data.totals.opportunities} unit="count" />
        </Panel>
        <Panel padding="tight">
          <Stat label="Close rate" value={data.totals.closeRateBps} unit="bps" />
        </Panel>
        <Panel padding="tight">
          <Stat label="Realistic unsold" value={data.totals.unsoldCents} unit="cents" />
        </Panel>
        <Panel padding="tight">
          <Stat label="Avg ticket" value={data.totals.avgTicketCents} unit="cents" />
        </Panel>
      </div>

      {/* Split: Seasonality chart + Tier/TTC lists */}
      <div className="grid gap-6 grid-cols-1 xl:grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)]">
        <Panel
          eyebrow="Seasonality"
          title="Close rate & avg ticket by month"
          right={
            <span className="text-[11px] uppercase tracking-[0.08em] text-muted">
              Bars: close rate · Line: avg ticket
            </span>
          }
        >
          <div className="w-full aspect-[3/1] min-h-[240px]">
            <ComboChart
              data={data.seasonality.map((s) => ({
                label: s.month,
                bar: s.closeRateBps,
                line: s.avgTicketCents,
              }))}
              barAxis={{ label: 'Close rate', unit: 'bps' }}
              lineAxis={{ label: 'Avg ticket', unit: 'cents' }}
              height={280}
            />
          </div>
        </Panel>

        <div className="flex flex-col gap-6">
          <Panel eyebrow="Tier selection" title="Price tier chosen">
            <BarList
              items={data.tierSelection.map((t) => ({
                label: TIER_LABEL[t.tier] ?? t.tier,
                count: t.count,
                pct: t.pct,
              }))}
            />
          </Panel>
          <Panel eyebrow="Time to close" title="How quickly customers decide">
            <BarList
              items={data.timeToClose.map((t) => ({
                label: TTC_LABEL[t.bucket] ?? t.bucket,
                count: t.count,
                pct: t.pct,
              }))}
            />
          </Panel>
        </div>
      </div>

      {/* By dept */}
      <Panel eyebrow="Departments" title="Breakdown by department" padding="cozy">
        <div className="overflow-x-auto -mx-2 px-2">
          <table className="w-full text-left">
            <thead>
              <tr className="col-head border-b border-border">
                <th className="py-2 pr-4 font-normal">Department</th>
                <th className="py-2 pr-4 font-normal text-right">Opportunities</th>
                <th className="py-2 pr-4 font-normal text-right">Close rate</th>
                <th className="py-2 pr-4 font-normal text-right hidden md:table-cell">Avg ticket</th>
                <th className="py-2 pr-2 font-normal text-right">Realistic unsold</th>
              </tr>
            </thead>
            <tbody>
              {data.byDept.map((d) => (
                <tr key={d.code} className="border-b border-border/60 last:border-0 hover:bg-surface-2/20 transition-colors">
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-3">
                      <span
                        aria-hidden="true"
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ background: `var(--d-${d.code})` }}
                      />
                      <span className="text-[13px] font-medium">{d.name}</span>
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-right font-mono tabular-nums text-[14px] font-medium">
                    {d.opportunities.toLocaleString('en-US')}
                  </td>
                  <td className="py-3 pr-4 text-right font-mono tabular-nums text-[13px]">
                    {fmtPercent(d.closeRateBps)}
                  </td>
                  <td className="py-3 pr-4 text-right font-mono tabular-nums text-[13px] text-muted hidden md:table-cell">
                    {fmtMoney(d.avgTicketCents)}
                  </td>
                  <td className="py-3 pr-2 text-right font-mono tabular-nums text-[14px] font-medium">
                    {fmtMoney(d.unsoldCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

interface BarItem {
  label: string;
  count: number;
  pct: number;
}

function BarList({ items }: { items: BarItem[] }) {
  return (
    <div className="flex flex-col gap-3">
      {items.map((i) => (
        <div key={i.label} className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-[13px]">
            <span>{i.label}</span>
            <span className="font-mono tabular-nums text-muted">{i.pct}%</span>
          </div>
          <div className="h-1.5 w-full bg-surface-2 rounded-full overflow-hidden">
            <div
              className="h-full bg-accent transition-[width] duration-300 ease-out"
              style={{ width: `${i.pct}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
