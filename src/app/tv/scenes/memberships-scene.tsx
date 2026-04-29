'use client';

import { useQuery } from '@tanstack/react-query';
import type { ApiEnvelope, MembershipsResponse } from '@/lib/types/kpi';
import { fmtCount } from '@/lib/format/count';
import { fmtPercent } from '@/lib/format/percent';
import { TvHeader } from './tv-header';

export function MembershipsScene() {
  const { data } = useQuery<MembershipsResponse>({
    queryKey: ['tv-memberships', 'mtd'],
    queryFn: async () => {
      const res = await fetch('/api/kpi/memberships?preset=mtd');
      if (!res.ok) throw new Error(`memberships: ${res.status}`);
      const json = (await res.json()) as ApiEnvelope<MembershipsResponse>;
      return json.data;
    },
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });

  if (!data) return <TvHeader eyebrow="Memberships" title="Loading…" />;

  const pct = data.goal > 0 ? Math.min(1, data.active / data.goal) : 0;

  return (
    <div className="flex flex-col h-full gap-6">
      <TvHeader
        eyebrow="Cool Club · Memberships"
        title="Active members"
        right={`${fmtCount(data.goal)} goal`}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-8 lg:gap-12 flex-1">
        <div className="flex flex-col justify-between gap-6">
          <div className="flex flex-col gap-3">
            <div className="text-display font-mono tabular-nums" style={{ fontSize: 'clamp(72px, 10vw, 160px)' }}>
              {fmtCount(data.active)}
            </div>
            <div className="text-[20px] text-muted font-mono tabular-nums">
              {fmtPercent(Math.round(pct * 10000), { decimals: 1 })} to goal
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Stat label="New MTD" value={`+${data.newMonth}`} accent="up" />
            <Stat label="Churn MTD" value={`−${data.churnMonth}`} accent="down" />
            <Stat label="Net" value={data.netMonth >= 0 ? `+${data.netMonth}` : String(data.netMonth)} accent={data.netMonth >= 0 ? 'up' : 'down'} />
          </div>
          <div>
            <div className="h-3 w-full bg-surface-2 rounded-full overflow-hidden">
              <div
                className="h-full bg-accent transition-[width] duration-1000 ease-out"
                style={{ width: `${pct * 100}%` }}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {data.breakdown.map((b) => {
            const ratio = data.active > 0 ? b.count / data.active : 0;
            const color = `var(${b.colorToken})`;
            return (
              <div
                key={b.tier}
                className="flex items-center gap-4 px-5 py-3 rounded-panel border border-border bg-surface"
              >
                <span
                  className="h-3 w-3 rounded-full shrink-0"
                  style={{ background: color }}
                  aria-hidden
                />
                <span className="text-[20px] font-medium flex-1 truncate">{b.tier}</span>
                <span className="text-[14px] text-muted font-mono tabular-nums">
                  {b.price > 0 ? `$${b.price}/mo` : '—'}
                </span>
                <div className="h-2 w-32 bg-surface-2 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${ratio * 100}%`, background: color }}
                  />
                </div>
                <span className="text-[24px] font-mono tabular-nums font-semibold w-[88px] text-right">
                  {fmtCount(b.count)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: 'up' | 'down';
}) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3 rounded-panel border border-border bg-surface">
      <span className="text-eyebrow uppercase text-muted">{label}</span>
      <span
        className={`text-[28px] font-mono tabular-nums font-semibold ${
          accent === 'up' ? 'text-up' : 'text-down'
        }`}
      >
        {value}
      </span>
    </div>
  );
}
