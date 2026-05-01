'use client';

import { useQuery } from '@tanstack/react-query';
import type { ApiEnvelope, Technician } from '@/lib/types/kpi';
import type { TopPerformersResponse } from '@/lib/hooks/use-top-performers';
import { fmtMoney } from '@/lib/format/money';
import { fmtPercent } from '@/lib/format/percent';
import { TvHeader } from './tv-header';

const ROLE_LABEL: Record<string, string> = {
  comfort_advisor: 'Comfort Advisors',
  hvac_tech: 'HVAC Service',
  hvac_maintenance: 'HVAC Maintenance',
  plumbing: 'Plumbing',
  electrical: 'Electrical',
  commercial_hvac: 'Commercial HVAC',
};

const ROLE_DEPT_COLOR: Record<string, string> = {
  comfort_advisor: '--d-hvac_sales',
  hvac_tech: '--d-hvac_service',
  hvac_maintenance: '--d-hvac_maintenance',
  plumbing: '--d-plumbing',
  electrical: '--d-electrical',
  commercial_hvac: '--d-commercial',
};

const MEDAL = { 1: '🥇', 2: '🥈', 3: '🥉' } as const;
const ORDINAL = { 1: '1st', 2: '2nd', 3: '3rd' } as const;

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .join('');
}

/**
 * Per-role podium scene for the TV rotation. Renders 1st / 2nd / 3rd
 * place with names, photos, revenue, close rate. Pulls from
 * /api/kpi/top-performers, the same endpoint that powers the
 * Engagement → Top Performers tab.
 */
export function LeaderboardScene({ roleCode }: { roleCode: string }) {
  // Locked to last_month — same as the Engagement → Top Performers tab.
  // Current MTD ranking is too volatile for a TV display.
  const { data } = useQuery<TopPerformersResponse>({
    queryKey: ['tv-top-performers', 'last_month'],
    queryFn: async () => {
      const res = await fetch('/api/kpi/top-performers?preset=last_month');
      if (!res.ok) throw new Error(`top-performers: ${res.status}`);
      const json = (await res.json()) as ApiEnvelope<TopPerformersResponse>;
      return json.data;
    },
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });

  const label = ROLE_LABEL[roleCode] ?? roleCode;

  if (!data) {
    return <TvHeader eyebrow={label} title="Loading…" />;
  }

  const podium = data.byRole.find((r) => r.role.code === roleCode);
  const top = podium?.top ?? [];
  if (top.length === 0) {
    return (
      <div className="flex flex-col h-full gap-6">
        <TvHeader eyebrow={`${label} · Last month`} title="Top performers" />
        <div className="flex-1 grid place-items-center text-muted text-[20px]">
          No data yet for this period.
        </div>
      </div>
    );
  }

  // Real-podium layout: 2 / 1 / 3 across, all cards bottom-aligned.
  // The hero (1st) is naturally taller (bigger avatar, bigger numbers,
  // more padding) so it rises above the runners-up — no h-full hack
  // needed and no reverse-podium effect from a wrapper-div mismatch.
  const first = top[0];
  const second = top[1];
  const third = top[2];

  return (
    <div className="flex flex-col h-full gap-6">
      <TvHeader eyebrow={`${label} · Last month`} title="Top performers" />

      {/* Outer flex centers the podium vertically in the available area
          so it doesn't slam to the floor; inner grid keeps items-end so
          the hero (1st) still rises above 2nd/3rd as a real podium. */}
      <div className="flex-1 flex items-center justify-center">
        <div className="w-full max-w-[1400px] grid grid-cols-1 md:grid-cols-3 gap-8 items-end">
          {second ? (
            <Card rank={2} tech={second} roleCode={roleCode} />
          ) : (
            <div className="hidden md:block" />
          )}
          <Card rank={1} tech={first} roleCode={roleCode} hero />
          {third ? (
            <Card rank={3} tech={third} roleCode={roleCode} />
          ) : (
            <div className="hidden md:block" />
          )}
        </div>
      </div>
    </div>
  );
}

function Card({
  rank,
  tech,
  roleCode,
  hero = false,
}: {
  rank: 1 | 2 | 3;
  tech: Technician;
  roleCode: string;
  hero?: boolean;
}) {
  const accent = `var(${ROLE_DEPT_COLOR[roleCode] ?? '--d-hvac_service'})`;
  const isCA = roleCode === 'comfort_advisor';

  return (
    <div
      className={`flex flex-col items-center gap-4 rounded-panel border ${
        hero ? 'px-8 pt-14 pb-10' : 'px-6 pt-8 pb-6'
      }`}
      style={{
        background:
          rank === 1
            ? 'linear-gradient(180deg, color-mix(in oklch, var(--accent) 14%, var(--surface-2)) 0%, var(--surface-2) 60%)'
            : 'var(--surface)',
        borderColor:
          rank === 1
            ? 'color-mix(in oklch, var(--accent) 60%, var(--border))'
            : 'var(--border)',
        boxShadow: rank === 1 ? 'var(--shadow-podium)' : undefined,
      }}
    >
      <div className="flex items-center gap-3 text-eyebrow uppercase text-muted">
        <span aria-hidden="true" className="text-[24px] leading-none">
          {MEDAL[rank]}
        </span>
        <span className="tracking-[0.12em]">{ORDINAL[rank]} place</span>
      </div>

      <div
        className="rounded-full grid place-items-center font-mono tabular-nums font-semibold overflow-hidden"
        style={{
          height: hero ? 144 : 112,
          width: hero ? 144 : 112,
          fontSize: hero ? 36 : 28,
          background: `color-mix(in oklch, ${accent} 25%, var(--surface-2))`,
          border: `1px solid ${rank === 1 ? 'var(--accent)' : 'var(--border)'}`,
          color: accent,
        }}
        aria-label={tech.name}
      >
        {tech.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={tech.photoUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          initials(tech.name)
        )}
      </div>

      <div className="flex flex-col items-center gap-1 text-center">
        <div
          className="font-semibold leading-tight"
          style={{ fontSize: hero ? 32 : 24 }}
        >
          {tech.name}
        </div>
      </div>

      <div
        className="font-mono tabular-nums font-semibold"
        style={{ fontSize: hero ? 56 : 40 }}
      >
        {fmtMoney(tech.revenue)}
      </div>

      <div className="flex items-center gap-4 text-[16px] text-muted font-mono tabular-nums">
        <span>{fmtPercent(tech.closeRate, { decimals: 1 })} close</span>
        <span aria-hidden className="h-1 w-1 rounded-full bg-border" />
        <span>{fmtMoney(isCA ? tech.avgSale : tech.avgTicket)} avg</span>
      </div>
    </div>
  );
}
