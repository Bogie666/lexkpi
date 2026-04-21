'use client';

import { cn } from '@/lib/cn';
import { Sparkline } from '@/components/charts/sparkline';
import { fmtMoney } from '@/lib/format/money';
import { fmtPercent } from '@/lib/format/percent';
import type { Role, Technician } from '@/lib/types/kpi';

const MEDAL = { 1: '🥇', 2: '🥈', 3: '🥉' } as const;
const ORDINAL = { 1: '1st', 2: '2nd', 3: '3rd' } as const;

function initials(name: string): string {
  return name
    .split(' ')
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('');
}

function primaryValue(tech: Technician, role: Role): string {
  switch (role.sortKey) {
    case 'avgTicket':
      return fmtMoney(tech.avgTicket);
    case 'jobs':
      return tech.jobs.toLocaleString('en-US');
    case 'closeRate':
      return fmtPercent(tech.closeRate);
    case 'revenue':
    default:
      return fmtMoney(tech.revenue);
  }
}

export interface PodiumCardProps {
  rank: 1 | 2 | 3;
  tech: Technician;
  role: Role;
}

export function PodiumCard({ rank, tech, role }: PodiumCardProps) {
  const isFirst = rank === 1;
  const deptColor = `var(--d-${tech.departmentCode})`;

  return (
    <div
      className={cn(
        'flex flex-col items-center text-center gap-3 px-5 py-6 rounded-panel border transition-shadow',
        isFirst
          ? 'bg-surface-2 border-accent/40 shadow-[var(--shadow-podium)]'
          : 'bg-surface border-border',
        isFirst ? 'py-8' : 'py-6',
      )}
      style={
        isFirst
          ? ({
              background:
                'linear-gradient(180deg, color-mix(in oklch, var(--accent) 8%, var(--surface-2)) 0%, var(--surface-2) 55%)',
            } as React.CSSProperties)
          : undefined
      }
    >
      <div className="flex items-center gap-2 text-eyebrow uppercase text-muted">
        <span aria-hidden="true" className="text-base">{MEDAL[rank]}</span>
        <span>{ORDINAL[rank]} place</span>
      </div>
      <div
        className={cn(
          'rounded-full grid place-items-center font-mono tabular-nums font-semibold',
          isFirst ? 'h-[76px] w-[76px] text-[22px]' : 'h-16 w-16 text-[18px]',
        )}
        style={{
          background: `color-mix(in oklch, ${deptColor} 25%, var(--surface-2))`,
          border: `1px solid ${isFirst ? 'var(--accent)' : 'var(--border)'}`,
          color: deptColor,
        }}
        aria-label={tech.name}
      >
        {initials(tech.name)}
      </div>
      <div className="flex flex-col items-center gap-0.5">
        <div className="text-[14px] font-medium">{tech.name}</div>
        <div className="text-[11px] uppercase tracking-[0.08em] text-muted">
          {tech.departmentCode.replace('_', ' ')}
        </div>
      </div>
      <div
        className={cn(
          'font-mono tabular-nums',
          isFirst ? 'text-[26px] font-semibold' : 'text-[22px] font-semibold',
        )}
      >
        {primaryValue(tech, role)}
      </div>
      <div className="flex items-center gap-2 text-[11px] text-muted font-mono tabular-nums">
        <span>{fmtPercent(tech.closeRate, { decimals: 1 })} close</span>
        <span aria-hidden="true" className="h-1 w-1 rounded-full bg-border" />
        <span>{tech.jobs} jobs</span>
      </div>
      <Sparkline
        values={tech.spark}
        width={160}
        height={28}
        stroke={tech.trend === 'down' ? 'var(--down)' : deptColor}
        fill="area"
      />
    </div>
  );
}

export interface PodiumProps {
  first: Technician;
  second?: Technician;
  third?: Technician;
  role: Role;
}

export function Podium({ first, second, third, role }: PodiumProps) {
  return (
    <div className="grid gap-4 grid-cols-1 md:grid-cols-3 items-end">
      {second ? <PodiumCard rank={2} tech={second} role={role} /> : <div className="hidden md:block" />}
      <div className="md:-mt-4">
        <PodiumCard rank={1} tech={first} role={role} />
      </div>
      {third ? <PodiumCard rank={3} tech={third} role={role} /> : <div className="hidden md:block" />}
    </div>
  );
}
