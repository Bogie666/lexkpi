'use client';

import { Panel } from '@/components/primitives/panel';
import { fmtMoney } from '@/lib/format/money';
import type { FinancialResponse } from '@/lib/types/kpi';

export function PotentialRevenuePanel({ data }: { data: FinancialResponse }) {
  const { potential } = data;
  const max = Math.max(...potential.byDept.map((d) => d.value), 1);

  return (
    <Panel eyebrow="Unsold estimates" title="Potential revenue">
      <div className="flex flex-col gap-5">
        <div>
          <div className="text-eyebrow uppercase text-muted mb-1">Total</div>
          <div className="text-kpi font-mono tabular-nums">{fmtMoney(potential.total)}</div>
        </div>
        <div className="flex flex-col gap-3">
          {potential.byDept.map((d) => {
            const pct = (d.value / max) * 100;
            const color = `var(--d-${d.code})`;
            return (
              <div key={d.code} className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-[13px]">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: color }} />
                    {d.name}
                  </span>
                  <span className="font-mono tabular-nums text-muted">{fmtMoney(d.value)}</span>
                </div>
                <div className="h-1 w-full bg-surface-2 rounded-full overflow-hidden">
                  <div
                    className="h-full transition-[width] duration-300 ease-out"
                    style={{ width: `${pct}%`, background: color }}
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
