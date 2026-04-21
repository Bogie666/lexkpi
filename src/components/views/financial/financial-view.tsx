'use client';

import { useFinancial } from '@/lib/hooks/use-financial';
import { useDashboardParams } from '@/lib/state/url-params';
import { SectionHead } from '@/components/primitives/section-head';
import { PeriodTabs } from '@/components/primitives/period-tabs';
import { Skeleton } from '@/components/primitives/skeleton';
import { Panel } from '@/components/primitives/panel';
import { fmtAsOf } from '@/lib/format/date';
import { FinancialHero } from './financial-hero';
import { FinancialKPIStrip } from './financial-kpi-strip';
import { DepartmentTable } from './department-table';
import { PotentialRevenuePanel } from './potential-revenue-panel';

export function FinancialView() {
  const [params, setParams] = useDashboardParams();
  const { data, isLoading, error, refetch } = useFinancial(params);

  return (
    <div className="flex flex-col gap-6">
      <SectionHead
        eyebrow={data ? data.meta.period : 'Financial'}
        title="Financial"
        right={
          <>
            <PeriodTabs value={params.period} onChange={(p) => setParams({ period: p })} />
            {data && (
              <span className="text-meta font-mono text-muted hidden md:inline">
                as of {fmtAsOf(data.meta.asOf)}
              </span>
            )}
          </>
        }
      />

      {isLoading && (
        <div className="flex flex-col gap-6">
          <Panel padding="cozy">
            <Skeleton variant="chart" />
          </Panel>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Panel key={i} padding="tight">
                <Skeleton variant="stat" />
              </Panel>
            ))}
          </div>
          <Panel padding="cozy">
            <Skeleton variant="table-row" count={5} className="mb-2" />
          </Panel>
        </div>
      )}

      {error && !isLoading && (
        <Panel>
          <div className="flex flex-col items-start gap-3">
            <div className="text-panel">Couldn&apos;t load financial data</div>
            <p className="text-[13px] text-muted">
              Something went wrong fetching the dashboard. You can try again.
            </p>
            <button
              onClick={() => refetch()}
              className="text-[13px] font-medium px-3 py-1.5 rounded-btn bg-surface-2 hover:bg-surface-2/80 transition-colors"
            >
              Retry
            </button>
          </div>
        </Panel>
      )}

      {data && (
        <>
          <FinancialHero data={data} compareMode={params.compare} />
          <FinancialKPIStrip data={data} compareMode={params.compare} />
          <div className="grid gap-6 grid-cols-1 xl:grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)]">
            <DepartmentTable data={data} compareMode={params.compare} />
            <PotentialRevenuePanel data={data} />
          </div>
        </>
      )}
    </div>
  );
}
