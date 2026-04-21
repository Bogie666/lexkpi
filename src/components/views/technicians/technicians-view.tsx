'use client';

import { useMemo } from 'react';
import { useDashboardParams } from '@/lib/state/url-params';
import { useTechnicians } from '@/lib/hooks/use-technicians';
import { SectionHead } from '@/components/primitives/section-head';
import { PeriodTabs } from '@/components/primitives/period-tabs';
import { Panel } from '@/components/primitives/panel';
import { Skeleton } from '@/components/primitives/skeleton';
import { CompareBanner } from '@/components/layout/compare-banner';
import { fmtAsOf } from '@/lib/format/date';
import { technicianInsights } from '@/lib/insights/technicians';
import { RoleSubTabs } from './role-sub-tabs';
import { TeamKPIStrip } from './team-kpi-strip';
import { Podium } from './podium';
import { TechLeaderboard } from './tech-leaderboard';

export function TechniciansView() {
  const [params, setParams] = useDashboardParams();
  const { data, isLoading, error, refetch } = useTechnicians(params);

  const compareOn = params.compare === 'ly' || params.compare === 'ly2';
  const compareYear: 'ly' | 'ly2' = params.compare === 'ly2' ? 'ly2' : 'ly';

  const insights = useMemo(
    () => (data && compareOn ? technicianInsights(data, compareYear) : []),
    [data, compareOn, compareYear],
  );

  return (
    <div className="flex flex-col gap-6">
      <SectionHead
        eyebrow="Technicians"
        title={data ? data.role.name : 'Technicians'}
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
        <>
          <Panel padding="cozy">
            <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
              <Skeleton variant="stat" count={4} />
            </div>
          </Panel>
          <Panel padding="cozy">
            <Skeleton variant="chart" />
          </Panel>
        </>
      )}

      {error && !isLoading && (
        <Panel>
          <div className="flex flex-col items-start gap-3">
            <div className="text-panel">Couldn&apos;t load technicians</div>
            <p className="text-[13px] text-muted">Something went wrong. Try again?</p>
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
          <RoleSubTabs
            value={data.role.code}
            onChange={(code) => setParams({ role: code })}
            roles={data.roles}
          />

          {compareOn && insights.length > 0 && (
            <CompareBanner insights={insights} mode={compareYear} />
          )}

          <TeamKPIStrip team={data.team} compareMode={params.compare} />

          {data.technicians.length >= 3 && (
            <Podium
              first={data.technicians[0]}
              second={data.technicians[1]}
              third={data.technicians[2]}
              role={data.role}
            />
          )}

          <TechLeaderboard technicians={data.technicians} compareMode={params.compare} />
        </>
      )}
    </div>
  );
}
