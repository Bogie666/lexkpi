'use client';

import { Panel } from '@/components/primitives/panel';
import { fmtMoney } from '@/lib/format/money';
import type { FinancialResponse } from '@/lib/types/kpi';

export function PotentialRevenuePanel({ data }: { data: FinancialResponse }) {
  const { potential } = data;
  const max = Math.max(...potential.byDept.map((d) => d.hot + d.warm), 1);

  return (
    <Panel
      eyebrow="Unsold estimates (last 30 days)"
      title="Potential revenue"
      right={
        <span className="text-[11px] uppercase tracking-[0.08em] text-muted">
          actionable pipeline
        </span>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <div className="text-eyebrow uppercase text-muted">Total</div>
          <div className="text-kpi font-mono tabular-nums">{fmtMoney(potential.total)}</div>
          <div className="flex items-center gap-4 text-[12px] font-mono tabular-nums">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
              <span className="text-muted">Hot (≤7d)</span>
              <span>{fmtMoney(potential.hot)}</span>
            </span>
            <span aria-hidden className="h-1 w-1 rounded-full bg-border" />
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-muted" aria-hidden />
              <span className="text-muted">Warm (8–30d)</span>
              <span>{fmtMoney(potential.warm)}</span>
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          {potential.byDept.map((d) => {
            const total = d.hot + d.warm;
            const pct = (total / max) * 100;
            const hotPct = total > 0 ? (d.hot / total) * 100 : 0;
            const color = `var(--d-${d.code})`;
            return (
              <div key={d.code} className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-[13px]">
                  <span className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: color }}
                      aria-hidden
                    />
                    {d.name}
                  </span>
                  <span className="font-mono tabular-nums text-muted">
                    {fmtMoney(total)}
                    {d.hot > 0 && (
                      <span className="ml-2 text-[11px] text-accent">
                        {fmtMoney(d.hot)} hot
                      </span>
                    )}
                  </span>
                </div>
                <div
                  className="flex h-1.5 bg-surface-2 rounded-full overflow-hidden"
                  style={{ width: `${pct}%` }}
                >
                  <div
                    className="h-full transition-[width] duration-300 ease-out"
                    style={{ width: `${hotPct}%`, background: color, opacity: 1 }}
                    aria-label="Hot"
                  />
                  <div
                    className="h-full transition-[width] duration-300 ease-out flex-1"
                    style={{ background: color, opacity: 0.45 }}
                    aria-label="Warm"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Panel>
  );
}
