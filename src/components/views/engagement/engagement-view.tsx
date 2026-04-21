'use client';

import { useDashboardParams } from '@/lib/state/url-params';
import { useTopPerformers } from '@/lib/hooks/use-top-performers';
import { SectionHead } from '@/components/primitives/section-head';
import { PeriodTabs } from '@/components/primitives/period-tabs';
import { Panel } from '@/components/primitives/panel';
import { Skeleton } from '@/components/primitives/skeleton';
import { SubTabBar } from '@/components/layout/sub-tab-bar';
import { Podium } from '@/components/views/technicians/podium';
import { TechLeaderboard } from '@/components/views/technicians/tech-leaderboard';
import { fmtAsOf } from '@/lib/format/date';
import type { Role } from '@/lib/types/kpi';

const SUB_OPTIONS = [
  { id: 'top_performers', label: 'Top Performers' },
  { id: 'reviews', label: 'Reviews' },
];

// Ranking across roles is by revenue; label it generically.
const ALL_ROLES_ROLE: Role = {
  code: 'all',
  name: 'All roles',
  primaryMetric: 'Closed revenue',
  sortKey: 'revenue',
};

export function EngagementView() {
  const [params, setParams] = useDashboardParams();
  const active = params.subtab === 'reviews' ? 'reviews' : 'top_performers';
  const showTop = active === 'top_performers';

  const topQuery = useTopPerformers(params, 10);

  return (
    <div className="flex flex-col gap-6">
      <SectionHead
        eyebrow="Engagement"
        title={showTop ? 'Top Performers' : 'Reviews'}
        right={
          <>
            <PeriodTabs value={params.period} onChange={(p) => setParams({ period: p })} />
            {showTop && topQuery.data && (
              <span className="text-meta font-mono text-muted hidden md:inline">
                as of {fmtAsOf(topQuery.data.meta.asOf)}
              </span>
            )}
          </>
        }
      />

      <SubTabBar
        value={active}
        onChange={(v) => setParams({ subtab: v })}
        options={SUB_OPTIONS}
      />

      {showTop ? (
        <>
          {topQuery.isLoading && (
            <Panel padding="cozy">
              <Skeleton variant="chart" />
            </Panel>
          )}

          {topQuery.error && !topQuery.isLoading && (
            <Panel>
              <div className="flex flex-col items-start gap-3">
                <div className="text-panel">Couldn&apos;t load top performers</div>
                <button
                  onClick={() => topQuery.refetch()}
                  className="text-[13px] font-medium px-3 py-1.5 rounded-btn bg-surface-2 hover:bg-surface-2/80 transition-colors"
                >
                  Retry
                </button>
              </div>
            </Panel>
          )}

          {topQuery.data && topQuery.data.performers.length >= 3 && (
            <Podium
              first={topQuery.data.performers[0]}
              second={topQuery.data.performers[1]}
              third={topQuery.data.performers[2]}
              role={ALL_ROLES_ROLE}
            />
          )}

          {topQuery.data && topQuery.data.performers.length > 0 && (
            <TechLeaderboard technicians={topQuery.data.performers} compareMode="none" />
          )}
        </>
      ) : (
        <Panel padding="cozy">
          <div className="flex flex-col items-start gap-3 py-8 max-w-lg">
            <div className="text-panel">Pending Google Business integration</div>
            <p className="text-[13px] text-muted leading-relaxed">
              The Reviews view shows aggregated Google reviews (total count, avg
              rating, star distribution, 12-month trend, recent review cards).
              It&apos;s wired off a <code className="font-mono text-[12px]">google_reviews</code>{' '}
              table that gets populated by the Google Business Profile sync — not yet
              connected. Once that sync is live, this panel will render the reviews
              hero + rating trend + recent-reviews grid per UI-SPEC §5.6.
            </p>
          </div>
        </Panel>
      )}
    </div>
  );
}
