'use client';

import { useQuery } from '@tanstack/react-query';
import type { ApiEnvelope } from '@/lib/types/kpi';
import type { UpcomingAppointmentsResponse } from '@/app/api/kpi/upcoming-appointments/route';
import { TvHeader } from './tv-header';

function dayLabel(iso: string): { dow: string; date: string } {
  const d = new Date(`${iso}T00:00:00Z`);
  return {
    dow: d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }),
    date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }),
  };
}

export function AppointmentsScene() {
  const { data } = useQuery<UpcomingAppointmentsResponse>({
    queryKey: ['tv-upcoming'],
    queryFn: async () => {
      const res = await fetch('/api/kpi/upcoming-appointments');
      if (!res.ok) throw new Error(`upcoming: ${res.status}`);
      const json = (await res.json()) as ApiEnvelope<UpcomingAppointmentsResponse>;
      return json.data;
    },
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });

  if (!data) return <TvHeader eyebrow="Upcoming" title="Loading…" />;

  const max = Math.max(...data.byDay.map((d) => d.count), 1);

  return (
    <div className="flex flex-col h-full gap-6">
      <TvHeader
        eyebrow="Upcoming · Next 7 days"
        title="Appointments by day"
        right={`${data.totalAppointments} total · today: ${data.todayCount}`}
      />

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6 overflow-hidden">
        <div className="flex flex-col gap-3 overflow-hidden">
          {data.byDay.map((d, i) => {
            const { dow, date } = dayLabel(d.date);
            const pct = (d.count / max) * 100;
            const isToday = i === 0;
            return (
              <div
                key={d.date}
                className="grid items-center gap-4"
                style={{ gridTemplateColumns: '110px 1fr 60px' }}
              >
                <div className="flex flex-col leading-tight">
                  <span className={`text-[20px] font-semibold ${isToday ? 'text-accent' : ''}`}>
                    {isToday ? 'Today' : dow}
                  </span>
                  <span className="text-[13px] text-muted">{date}</span>
                </div>
                <div className="h-5 bg-surface-2 rounded-full overflow-hidden">
                  <div
                    className="h-full flex"
                    style={{ width: `${pct}%` }}
                  >
                    {d.depts.map((s) => {
                      const segPct = d.count > 0 ? (s.count / d.count) * 100 : 0;
                      const color = s.code ? `var(--d-${s.code})` : 'var(--muted)';
                      return (
                        <div
                          key={s.code ?? s.name}
                          className="h-full"
                          style={{
                            width: `${segPct}%`,
                            background: color,
                            opacity: isToday ? 1 : 0.78,
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
                <span className="text-[24px] font-mono tabular-nums text-right">{d.count}</span>
              </div>
            );
          })}
        </div>

        <div className="flex flex-col gap-2 overflow-hidden">
          <span className="text-eyebrow uppercase text-muted mb-1">Top job types</span>
          {data.topJobTypes.slice(0, 8).map((t) => {
            const top = data.topJobTypes[0]?.count || 1;
            const pct = (t.count / top) * 100;
            return (
              <div key={t.name} className="grid items-center gap-3" style={{ gridTemplateColumns: '1fr 100px 60px' }}>
                <span className="text-[15px] truncate">{t.name}</span>
                <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
                  <div className="h-full bg-accent/70" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-[18px] font-mono tabular-nums text-right">{t.count}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
