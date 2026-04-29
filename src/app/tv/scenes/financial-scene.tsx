'use client';

import { useQuery } from '@tanstack/react-query';
import type { ApiEnvelope, FinancialResponse } from '@/lib/types/kpi';
import { fmtMoney } from '@/lib/format/money';
import { fmtPercent } from '@/lib/format/percent';
import { AreaTrend } from '@/components/charts/area-trend';
import { TvHeader } from './tv-header';

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function FinancialScene() {
  const { data } = useQuery<FinancialResponse>({
    queryKey: ['tv-financial', 'mtd'],
    queryFn: async () => {
      const res = await fetch('/api/kpi/financial?preset=mtd');
      if (!res.ok) throw new Error(`financial: ${res.status}`);
      const json = (await res.json()) as ApiEnvelope<FinancialResponse>;
      return json.data;
    },
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });

  if (!data) {
    return <TvHeader eyebrow="Financial" title="Loading…" />;
  }

  const goal = data.total.target;
  const rev = data.total.revenue.value;
  const pct = goal > 0 ? Math.min(1, rev / goal) : 0;
  const isLong = data.trend.length > 60;
  const trend = data.trend.map((t) => {
    const dd = Number(t.date.slice(-2));
    const mm = Number(t.date.slice(5, 7));
    return {
      label: isLong && dd === 1 ? MONTH[mm - 1] ?? '' : isLong ? '' : String(dd),
      value: t.actual,
      target: t.target,
    };
  });

  return (
    <div className="flex flex-col h-full gap-6">
      <TvHeader eyebrow={`${data.meta.period} · Company revenue`} title="Revenue to date" />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-8 lg:gap-12 flex-1">
        <div className="flex flex-col justify-between gap-6">
          <div className="flex flex-col gap-3">
            <span className="text-eyebrow uppercase text-muted">Total revenue</span>
            <div className="text-display font-mono tabular-nums" style={{ fontSize: 'clamp(64px, 8vw, 120px)' }}>
              {fmtMoney(rev)}
            </div>
            <div className="flex items-center gap-3 text-[20px] text-muted font-mono tabular-nums flex-wrap">
              <span>{fmtMoney(goal)} goal</span>
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-border" />
              <span className={pct >= 1 ? 'text-up' : 'text-text'}>
                {fmtPercent(Math.round(pct * 10000), { decimals: 1 })} to goal
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-[14px] text-muted">
              <span className="text-eyebrow uppercase">Progress</span>
              <span className="font-mono tabular-nums">{fmtPercent(Math.round(pct * 10000))}</span>
            </div>
            <div className="h-3 w-full bg-surface-2 rounded-full overflow-hidden">
              <div
                className="h-full bg-accent transition-[width] duration-1000 ease-out"
                style={{ width: `${pct * 100}%` }}
              />
            </div>
          </div>
        </div>

        <div className="min-h-[300px]">
          <AreaTrend data={trend} height={400} unit="cents" valueLabel="Revenue" />
        </div>
      </div>
    </div>
  );
}
