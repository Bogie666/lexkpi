'use client';

import { useQuery } from '@tanstack/react-query';
import type { ApiEnvelope, CallCenterResponse } from '@/lib/types/kpi';
import { fmtPercent } from '@/lib/format/percent';
import { StackedBars } from '@/components/charts/stacked-bars';
import { TvHeader } from './tv-header';

export function CallCenterScene() {
  const { data } = useQuery<CallCenterResponse>({
    queryKey: ['tv-callcenter', 'mtd'],
    queryFn: async () => {
      const res = await fetch('/api/kpi/callcenter?preset=mtd');
      if (!res.ok) throw new Error(`callcenter: ${res.status}`);
      const json = (await res.json()) as ApiEnvelope<CallCenterResponse>;
      return json.data;
    },
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });

  if (!data) return <TvHeader eyebrow="Call Center" title="Loading…" />;

  const booked = data.kpis.booked.value;
  const bookRate = data.kpis.bookRate.value;
  const avgCall = data.kpis.avgCallTime.value;
  const abandon = data.kpis.abandonRate.value;

  return (
    <div className="flex flex-col h-full gap-6">
      <TvHeader
        eyebrow="Call Center · MTD"
        title="Calls vs bookings"
        right={`${data.agents.length} agents`}
      />

      <div className="grid gap-6 grid-cols-2 lg:grid-cols-4">
        <Stat label="Booked" value={booked.toLocaleString('en-US')} />
        <Stat label="Booking rate" value={fmtPercent(bookRate, { decimals: 1 })} />
        <Stat label="Avg call time" value={`${Math.round(avgCall)}s`} />
        <Stat label="Abandon" value={fmtPercent(abandon, { decimals: 1 })} />
      </div>

      <div className="flex-1 min-h-[280px]">
        <StackedBars
          data={data.hourly.map((h) => ({
            label: h.hr,
            total: h.calls,
            highlighted: h.booked,
          }))}
          highlightedLabel="Booked"
          totalLabel="Calls"
          height={360}
        />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1.5 px-5 py-4 rounded-panel border border-border bg-surface">
      <span className="text-eyebrow uppercase text-muted">{label}</span>
      <span className="text-[40px] font-mono tabular-nums font-semibold">{value}</span>
    </div>
  );
}
