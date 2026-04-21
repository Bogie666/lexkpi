'use client';

import { Panel } from '@/components/primitives/panel';
import { DeltaPill } from '@/components/primitives/delta-pill';
import { ComparePill } from '@/components/primitives/compare-pill';
import { Sparkline } from '@/components/charts/sparkline';
import { fmtMoney } from '@/lib/format/money';
import { fmtPercent } from '@/lib/format/percent';
import type { FinancialResponse } from '@/lib/types/kpi';
import type { CompareMode } from '@/lib/state/url-params';

export interface DepartmentTableProps {
  data: FinancialResponse;
  compareMode: CompareMode;
}

export function DepartmentTable({ data, compareMode }: DepartmentTableProps) {
  const compareOn = compareMode === 'ly' || compareMode === 'ly2';
  const compareKey: 'ly' | 'ly2' = compareMode === 'ly2' ? 'ly2' : 'ly';

  return (
    <Panel
      eyebrow="Departments"
      title="Revenue by department"
      padding="cozy"
    >
      <div className="overflow-x-auto -mx-2 px-2">
        <table className="w-full text-left">
          <thead>
            <tr className="col-head border-b border-border">
              <th className="py-2 pr-4 font-normal">Department</th>
              <th className="py-2 pr-4 font-normal text-right">Revenue</th>
              <th className="py-2 pr-4 font-normal text-right">Target</th>
              <th className="py-2 pr-4 font-normal text-right hidden md:table-cell">% to Goal</th>
              <th className="py-2 pr-4 font-normal text-right">
                {compareOn ? 'Δ vs ' + (compareKey === 'ly2' ? '2024' : 'LY') : 'vs Last'}
              </th>
              <th className="py-2 pr-2 font-normal text-right hidden lg:table-cell">Trend</th>
            </tr>
          </thead>
          <tbody>
            {data.departments.map((d) => {
              const pctGoal = (d.revenue.value / d.target) * 100;
              return (
                <tr key={d.code} className="border-b border-border/60 last:border-0 hover:bg-surface-2/20 transition-colors">
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-3">
                      <span
                        aria-hidden="true"
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ background: `var(${d.colorToken})` }}
                      />
                      <span className="text-[13px] font-medium">{d.name}</span>
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-right font-mono tabular-nums text-[14px]">
                    {fmtMoney(d.revenue.value)}
                  </td>
                  <td className="py-3 pr-4 text-right font-mono tabular-nums text-[13px] text-muted">
                    {fmtMoney(d.target)}
                  </td>
                  <td className="py-3 pr-4 hidden md:table-cell">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-20 h-1 bg-surface-2 rounded-full overflow-hidden">
                        <div
                          className="h-full transition-[width] duration-300 ease-out"
                          style={{
                            width: `${Math.min(pctGoal, 100)}%`,
                            background: `var(${d.colorToken})`,
                          }}
                        />
                      </div>
                      <span className="font-mono tabular-nums text-[12px] text-muted w-12 text-right">
                        {fmtPercent(Math.round(pctGoal * 100))}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-right">
                    <div className="flex justify-end">
                      {compareOn && d.revenue[compareKey] !== undefined ? (
                        <ComparePill
                          current={d.revenue.value}
                          comparison={d.revenue[compareKey]!}
                          unit="cents"
                          baseline={compareKey}
                          size="sm"
                        />
                      ) : (
                        <DeltaPill
                          current={d.revenue.value}
                          previous={d.revenue.prev}
                          format="money"
                          size="sm"
                        />
                      )}
                    </div>
                  </td>
                  <td className="py-3 pr-2 text-right hidden lg:table-cell">
                    <div className="inline-flex">
                      <Sparkline
                        values={d.spark}
                        compareValues={compareOn ? d.lySpark : undefined}
                        width={96}
                        height={28}
                        stroke={`var(${d.colorToken})`}
                        fill="area"
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
