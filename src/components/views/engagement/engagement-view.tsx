'use client';

import { useDashboardParams } from '@/lib/state/url-params';
import { useTopPerformers } from '@/lib/hooks/use-top-performers';
import { SectionHead } from '@/components/primitives/section-head';
import { PeriodTabs } from '@/components/primitives/period-tabs';
import { Panel } from '@/components/primitives/panel';
import { Skeleton } from '@/components/primitives/skeleton';
import { SubTabBar } from '@/components/layout/sub-tab-bar';
import { Podium } from '@/components/views/technicians/podium';
import { fmtAsOf } from '@/lib/format/date';

const SUB_OPTIONS = [
  { id: 'top_performers', label: 'Top Performers' },
  { id: 'reviews', label: 'Reviews' },
];

export function EngagementView() {
  const [params, setParams] = useDashboardParams();
  const active = params.subtab === 'reviews' ? 'reviews' : 'top_performers';
  const showTop = active === 'top_performers';

  const topQuery = useTopPerformers(params);

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

          {topQuery.data && (
            <div className="flex flex-col gap-8">
              {topQuery.data.byRole.map((r) =>
                r.top.length === 0 ? null : (
                  <section key={r.role.code} className="flex flex-col gap-4">
                    <div className="flex items-baseline justify-between gap-3">
                      <h2 className="text-panel">{r.role.name}</h2>
                      <span className="text-[12px] uppercase tracking-[0.08em] text-muted">
                        Top {r.top.length} · {r.role.primaryMetric}
                      </span>
                    </div>
                    <Podium
                      first={r.top[0]}
                      second={r.top[1]}
                      third={r.top[2]}
                      role={r.role}
                    />
                  </section>
                ),
              )}
              {topQuery.data.byRole.every((r) => r.top.length === 0) && (
                <Panel>
                  <div className="text-[13px] text-muted">
                    No technician data yet for this period — once the next sync runs the
                    podiums will populate.
                  </div>
                </Panel>
              )}
            </div>
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
