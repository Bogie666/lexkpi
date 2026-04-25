'use client';

import { useUpcomingAppointments } from '@/lib/hooks/use-upcoming-appointments';
import { SectionHead } from '@/components/primitives/section-head';
import { Panel } from '@/components/primitives/panel';
import { Skeleton } from '@/components/primitives/skeleton';
import { fmtAsOf } from '@/lib/format/date';
import { UpcomingAppointmentsPanel } from '@/components/views/operations/upcoming-appointments-panel';

export function AppointmentsView() {
  const { data, isLoading, error, refetch } = useUpcomingAppointments();
  // The upcoming-appointments route doesn't expose a meta.asOf, so we
  // stamp the load time here for the header.
  const asOfNow = new Date().toISOString();

  return (
    <div className="flex flex-col gap-6">
      <SectionHead
        eyebrow="Appointments"
        title="Upcoming"
        right={
          data && (
            <span className="text-meta font-mono text-muted hidden md:inline">
              Next 7 days · as of {fmtAsOf(asOfNow)}
            </span>
          )
        }
      />

      {isLoading && (
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

      {error && !isLoading && (
        <Panel>
          <div className="flex flex-col items-start gap-3">
            <div className="text-panel">Couldn&apos;t load appointments</div>
            <button
              onClick={() => refetch()}
              className="text-[13px] font-medium px-3 py-1.5 rounded-btn bg-surface-2 hover:bg-surface-2/80 transition-colors"
            >
              Retry
            </button>
          </div>
        </Panel>
      )}

      {data && <UpcomingAppointmentsPanel data={data} />}
    </div>
  );
}
