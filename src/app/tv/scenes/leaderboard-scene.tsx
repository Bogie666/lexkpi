'use client';

import { useQuery } from '@tanstack/react-query';
import type { ApiEnvelope, TechniciansResponse, Technician } from '@/lib/types/kpi';
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

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .join('');
}

export function LeaderboardScene({ roleCode }: { roleCode: string }) {
  const { data } = useQuery<TechniciansResponse>({
    queryKey: ['tv-tech', roleCode, 'mtd'],
    queryFn: async () => {
      const res = await fetch(`/api/kpi/technicians?role=${roleCode}&preset=mtd`);
      if (!res.ok) throw new Error(`technicians: ${res.status}`);
      const json = (await res.json()) as ApiEnvelope<TechniciansResponse>;
      return json.data;
    },
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });

  const isCA = roleCode === 'comfort_advisor';
  const color = ROLE_DEPT_COLOR[roleCode] ?? '--d-hvac_service';

  if (!data) {
    return <TvHeader eyebrow={ROLE_LABEL[roleCode] ?? roleCode} title="Loading…" />;
  }

  const top = data.technicians.slice(0, 8);

  return (
    <div className="flex flex-col h-full gap-6">
      <TvHeader
        eyebrow={ROLE_LABEL[roleCode] ?? roleCode}
        title={isCA ? 'Top sales performers' : 'Top technicians'}
        right={`MTD · ${data.team.revenue.value > 0 ? fmtMoney(data.team.revenue.value) : '—'} team`}
      />

      <div className="flex-1 overflow-hidden">
        <div className="grid gap-3" style={{ gridTemplateColumns: '1fr' }}>
          {top.map((t, i) => (
            <Row key={t.employeeId} tech={t} rank={i + 1} isCA={isCA} colorVar={color} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Row({
  tech,
  rank,
  isCA,
  colorVar,
}: {
  tech: Technician;
  rank: number;
  isCA: boolean;
  colorVar: string;
}) {
  const accent = `var(${colorVar})`;
  return (
    <div
      className="flex items-center gap-5 px-5 py-4 rounded-panel border border-border bg-surface"
      style={{
        borderColor:
          rank === 1
            ? 'var(--accent)'
            : rank === 2
              ? 'color-mix(in oklch, var(--muted) 40%, var(--border))'
              : 'var(--border)',
      }}
    >
      <span
        className="shrink-0 inline-flex items-center justify-center h-12 w-16 rounded-pill border text-[20px] font-mono tabular-nums font-semibold"
        style={{
          background:
            rank === 1
              ? 'color-mix(in oklch, var(--accent) 22%, var(--surface-2))'
              : rank === 3
                ? 'color-mix(in oklch, var(--warning) 16%, var(--surface-2))'
                : 'var(--surface-2)',
          color:
            rank === 1
              ? 'var(--accent)'
              : rank === 3
                ? 'var(--warning)'
                : 'var(--muted)',
          borderColor:
            rank === 1
              ? 'var(--accent)'
              : rank === 3
                ? 'color-mix(in oklch, var(--warning) 60%, var(--border))'
                : 'var(--border)',
        }}
      >
        #{rank}
      </span>

      <span
        className="shrink-0 h-14 w-14 rounded-full grid place-items-center overflow-hidden text-[16px] font-mono font-semibold"
        style={{
          background: `color-mix(in oklch, ${accent} 22%, var(--surface-2))`,
          border: `1px solid var(--border)`,
          color: accent,
        }}
      >
        {tech.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={tech.photoUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          initials(tech.name)
        )}
      </span>

      <div className="flex flex-col flex-1 min-w-0">
        <span className="text-[26px] font-semibold leading-tight truncate">{tech.name}</span>
        <span className="text-[14px] text-muted capitalize">
          {tech.departmentCode.replace('_', ' ')}
        </span>
      </div>

      <div className="flex items-center gap-8 shrink-0">
        <div className="flex flex-col items-end">
          <span className="text-[12px] text-muted uppercase tracking-[0.08em]">Revenue</span>
          <span className="text-[28px] font-mono tabular-nums font-semibold">
            {fmtMoney(tech.revenue)}
          </span>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[12px] text-muted uppercase tracking-[0.08em]">Close</span>
          <span
            className={`text-[24px] font-mono tabular-nums ${
              tech.closeRate >= 4500 ? 'text-up' : tech.closeRate < 2500 ? 'text-warning' : ''
            }`}
          >
            {fmtPercent(tech.closeRate, { decimals: 1 })}
          </span>
        </div>
        <div className="flex flex-col items-end hidden xl:flex">
          <span className="text-[12px] text-muted uppercase tracking-[0.08em]">
            {isCA ? 'Avg sale' : 'Avg ticket'}
          </span>
          <span className="text-[20px] font-mono tabular-nums text-muted">
            {fmtMoney(isCA ? tech.avgSale : tech.avgTicket)}
          </span>
        </div>
      </div>
    </div>
  );
}
