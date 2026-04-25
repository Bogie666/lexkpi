'use client';

import { useDashboardParams } from '@/lib/state/url-params';
import { useCallCenter } from '@/lib/hooks/use-callcenter';
import { useMemberships } from '@/lib/hooks/use-memberships';
import { SectionHead } from '@/components/primitives/section-head';
import { PeriodTabs } from '@/components/primitives/period-tabs';
import { Panel } from '@/components/primitives/panel';
import { Skeleton } from '@/components/primitives/skeleton';
import { SubTabBar } from '@/components/layout/sub-tab-bar';
import { fmtAsOf } from '@/lib/format/date';
import { CallCenterPanel } from './call-center-panel';
import { MembershipsPanel } from './memberships-panel';

const SUB_OPTIONS = [
  { id: 'call_center', label: 'Call Center' },
  { id: 'memberships', label: 'Memberships' },
];

export function OperationsView() {
  const [params, setParams] = useDashboardParams();
  const active: 'call_center' | 'memberships' =
    params.subtab === 'memberships' ? 'memberships' : 'call_center';

  const cc = useCallCenter(params);
  const mem = useMemberships(params);

  const current = active === 'call_center' ? cc : mem;
  const meta = 'meta' in (current.data ?? {}) ? (current.data as { meta?: { asOf: string } }).meta : undefined;

  return (
    <div className="flex flex-col gap-6">
      <SectionHead
        eyebrow="Operations"
        title={active === 'call_center' ? 'Call Center' : 'Memberships'}
        right={
          <>
            <PeriodTabs value={params.period} onChange={(p) => setParams({ period: p })} />
            {meta && (
              <span className="text-meta font-mono text-muted hidden md:inline">
                as of {fmtAsOf(meta.asOf)}
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

      {current.isLoading && (
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
      )}

      {current.error && !current.isLoading && (
        <Panel>
          <div className="flex flex-col items-start gap-3">
            <div className="text-panel">Couldn&apos;t load data</div>
            <p className="text-[13px] text-muted">Something went wrong. Try again?</p>
            <button
              onClick={() => current.refetch()}
              className="text-[13px] font-medium px-3 py-1.5 rounded-btn bg-surface-2 hover:bg-surface-2/80 transition-colors"
            >
              Retry
            </button>
          </div>
        </Panel>
      )}

      {active === 'call_center' && cc.data && (
        <CallCenterPanel data={cc.data} compareMode={params.compare} />
      )}
      {active === 'memberships' && mem.data && (
        <MembershipsPanel data={mem.data} compareMode={params.compare} />
      )}
    </div>
  );
}
