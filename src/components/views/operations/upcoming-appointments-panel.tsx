'use client';

import { Panel } from '@/components/primitives/panel';
import { Stat } from '@/components/primitives/stat';
import type { UpcomingAppointmentsResponse } from '@/app/api/kpi/upcoming-appointments/route';

export interface UpcomingAppointmentsPanelProps {
  data: UpcomingAppointmentsResponse;
}

function fmtRange(from: string, to: string): string {
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
  return `${fmt(start)} – ${fmt(end)}`;
}

function dayLabel(isoDate: string): { dow: string; day: string } {
  const d = new Date(`${isoDate}T00:00:00Z`);
  return {
    dow: d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }),
    day: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }),
  };
}

export function UpcomingAppointmentsPanel({ data }: UpcomingAppointmentsPanelProps) {
  const maxDay = Math.max(...data.byDay.map((d) => d.count), 1);
  const avgPerDay = data.byDay.length > 0 ? Math.round(data.totalAppointments / data.byDay.length) : 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Headline stats */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Panel padding="tight">
          <Stat label="Total this week" value={data.totalAppointments} unit="count" />
        </Panel>
        <Panel padding="tight">
          <Stat label="Today" value={data.todayCount} unit="count" />
        </Panel>
        <Panel padding="tight">
          <Stat label="Tomorrow" value={data.tomorrowCount} unit="count" />
        </Panel>
        <Panel padding="tight">
          <Stat label="Avg / day" value={avgPerDay} unit="count" />
        </Panel>
      </div>

      {/* Daily distribution */}
      <Panel
        eyebrow={`Next 7 days · ${fmtRange(data.windowStart, data.windowEnd)}`}
        title="By day"
        padding="cozy"
      >
        <div className="flex flex-col gap-2">
          {data.byDay.map((d, i) => {
            const { dow, day } = dayLabel(d.date);
            const pct = (d.count / maxDay) * 100;
            const isToday = i === 0;
            return (
              <div key={d.date} className="grid items-center gap-3" style={{ gridTemplateColumns: '70px 1fr 40px' }}>
                <div className="flex flex-col leading-tight">
                  <span className={`text-[12px] font-medium ${isToday ? 'text-accent' : ''}`}>
                    {isToday ? 'Today' : dow}
                  </span>
                  <span className="text-[10px] text-muted">{day}</span>
                </div>
                <div className="h-3 bg-surface-2 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent transition-[width] duration-300 ease-out"
                    style={{ width: `${pct}%`, opacity: isToday ? 1 : 0.6 }}
                  />
                </div>
                <span className="text-[13px] font-mono tabular-nums text-right">{d.count}</span>
              </div>
            );
          })}
        </div>
      </Panel>

      {/* Per-department breakdown */}
      <Panel
        eyebrow="Breakdown"
        title="By department & job type"
        right={
          <span className="text-[11px] uppercase tracking-[0.08em] text-muted font-mono tabular-nums">
            {data.groups.length} depts
          </span>
        }
        padding="cozy"
      >
        {data.groups.length === 0 && (
          <div className="text-[13px] text-muted">
            Nothing scheduled in the next week.
          </div>
        )}
        <div className="flex flex-col gap-5">
          {data.groups.map((g) => {
            const color = g.departmentCode
              ? `var(--d-${g.departmentCode})`
              : 'var(--muted)';
            return (
              <div key={g.departmentCode ?? g.departmentName ?? 'u'} className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ background: color }}
                      aria-hidden
                    />
                    <span className="text-[14px] font-medium">
                      {g.departmentName ?? 'Uncategorized'}
                    </span>
                  </div>
                  <span className="text-[13px] font-mono tabular-nums text-muted">
                    {g.total}
                  </span>
                </div>
                <div className="flex flex-col gap-1 pl-4 border-l border-border/60">
                  {g.jobTypes.map((t) => (
                    <div
                      key={t.name}
                      className="flex items-center justify-between text-[12px]"
                    >
                      <span className="text-muted truncate pr-3">{t.name}</span>
                      <span className="font-mono tabular-nums">{t.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      {/* Top job types across all depts */}
      {data.topJobTypes.length > 0 && (
        <Panel
          eyebrow="Overall"
          title="Top job types this week"
          padding="cozy"
        >
          <div className="flex flex-col gap-2">
            {data.topJobTypes.map((t) => {
              const max = data.topJobTypes[0]?.count || 1;
              const pct = (t.count / max) * 100;
              return (
                <div
                  key={t.name}
                  className="grid items-center gap-3"
                  style={{ gridTemplateColumns: 'minmax(0, 1fr) 100px 40px' }}
                >
                  <span className="text-[13px] truncate">{t.name}</span>
                  <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent/70 transition-[width] duration-300 ease-out"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[12px] font-mono tabular-nums text-right">
                    {t.count}
                  </span>
                </div>
              );
            })}
          </div>
        </Panel>
      )}
    </div>
  );
}
