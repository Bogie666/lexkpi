'use client';

import { cn } from '@/lib/cn';
import { Panel } from '@/components/primitives/panel';
import { ComparePill } from '@/components/primitives/compare-pill';
import { Sparkline } from '@/components/charts/sparkline';
import { fmtMoney } from '@/lib/format/money';
import { fmtPercent } from '@/lib/format/percent';
import type { Technician } from '@/lib/types/kpi';
import type { CompareMode } from '@/lib/state/url-params';

export interface TechLeaderboardProps {
  technicians: Technician[];
  compareMode: CompareMode;
}

function initials(name: string): string {
  return name
    .split(' ')
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('');
}

const RANK_CLS: Record<string, string> = {
  '1': 'bg-[color-mix(in_oklch,var(--accent)_20%,var(--surface-2))] text-accent border-accent/50',
  '2': 'bg-surface-2 text-muted border-border',
  '3': 'bg-[color-mix(in_oklch,var(--warning)_15%,var(--surface-2))] text-warning border-warning/40',
  n: 'bg-surface-2 text-muted border-border',
};

export function TechLeaderboard({ technicians, compareMode }: TechLeaderboardProps) {
  const compareOn = compareMode === 'ly' || compareMode === 'ly2';

  return (
    <Panel eyebrow="Leaderboard" title="Performance by technician" padding="cozy">
      <div className="overflow-x-auto -mx-2 px-2">
        <table className="w-full text-left">
          <thead>
            <tr className="col-head border-b border-border">
              <th className="py-2 pr-4 font-normal w-[60px]">Rank</th>
              <th className="py-2 pr-4 font-normal">Technician</th>
              <th className="py-2 pr-4 font-normal text-right">Revenue</th>
              {compareOn && (
                <th className="py-2 pr-4 font-normal text-right hidden lg:table-cell">Δ Rev</th>
              )}
              <th className="py-2 pr-4 font-normal text-right hidden md:table-cell">Close</th>
              {compareOn && (
                <th className="py-2 pr-4 font-normal text-right hidden lg:table-cell">Δ Close</th>
              )}
              <th className="py-2 pr-4 font-normal text-right hidden md:table-cell">Avg ticket</th>
              {compareOn && (
                <th className="py-2 pr-4 font-normal text-right hidden lg:table-cell">Δ Ticket</th>
              )}
              {!compareOn && (
                <>
                  <th className="py-2 pr-4 font-normal text-right hidden md:table-cell">Jobs</th>
                  <th className="py-2 pr-4 font-normal text-right hidden lg:table-cell">Members</th>
                </>
              )}
              <th className="py-2 pr-2 font-normal text-right hidden lg:table-cell">Trend</th>
            </tr>
          </thead>
          <tbody>
            {technicians.map((t) => {
              const rankKey = t.rank <= 3 ? String(t.rank) : 'n';
              const deptColor = `var(--d-${t.departmentCode})`;
              return (
                <tr
                  key={t.employeeId}
                  className="border-b border-border/60 last:border-0 hover:bg-surface-2/20 transition-colors"
                >
                  <td className="py-3 pr-4">
                    <span
                      className={cn(
                        'inline-flex items-center justify-center h-7 w-10 rounded-pill border text-[12px] font-mono tabular-nums font-medium',
                        RANK_CLS[rankKey],
                      )}
                    >
                      #{t.rank}
                    </span>
                  </td>
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className="shrink-0 h-8 w-8 rounded-full grid place-items-center text-[11px] font-mono font-medium"
                        style={{
                          background: `color-mix(in oklch, ${deptColor} 22%, var(--surface-2))`,
                          border: `1px solid var(--border)`,
                          color: deptColor,
                        }}
                        aria-hidden="true"
                      >
                        {initials(t.name)}
                      </span>
                      <div className="flex flex-col min-w-0">
                        <span className="text-[13px] font-medium truncate">{t.name}</span>
                        <span className="text-[11px] text-muted capitalize">
                          {t.departmentCode.replace('_', ' ')}
                        </span>
                      </div>
                      <span
                        aria-hidden="true"
                        className="h-2 w-2 rounded-full shrink-0 ml-auto md:ml-0"
                        style={{ background: deptColor }}
                      />
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-right font-mono tabular-nums text-[14px] font-medium">
                    {fmtMoney(t.revenue)}
                  </td>
                  {compareOn && (
                    <td className="py-3 pr-4 text-right hidden lg:table-cell">
                      <div className="flex justify-end">
                        {t.ly !== undefined ? (
                          <ComparePill
                            current={t.revenue}
                            comparison={t.ly}
                            unit="cents"
                            baseline={compareMode === 'ly2' ? 'ly2' : 'ly'}
                            size="sm"
                          />
                        ) : (
                          <span className="text-muted text-[12px]">—</span>
                        )}
                      </div>
                    </td>
                  )}
                  <td className="py-3 pr-4 text-right font-mono tabular-nums text-[13px] hidden md:table-cell">
                    {fmtPercent(t.closeRate, { decimals: 1 })}
                  </td>
                  {compareOn && (
                    <td className="py-3 pr-4 text-right hidden lg:table-cell">
                      <div className="flex justify-end">
                        {t.lyCloseRate !== undefined ? (
                          <ComparePill
                            current={t.closeRate}
                            comparison={t.lyCloseRate}
                            unit="bps"
                            baseline="ly"
                            size="sm"
                          />
                        ) : (
                          <span className="text-muted text-[12px]">—</span>
                        )}
                      </div>
                    </td>
                  )}
                  <td className="py-3 pr-4 text-right font-mono tabular-nums text-[13px] text-muted hidden md:table-cell">
                    {fmtMoney(t.avgTicket)}
                  </td>
                  {compareOn && (
                    <td className="py-3 pr-4 text-right hidden lg:table-cell">
                      <div className="flex justify-end">
                        {t.lyAvgTicket !== undefined ? (
                          <ComparePill
                            current={t.avgTicket}
                            comparison={t.lyAvgTicket}
                            unit="cents"
                            baseline="ly"
                            size="sm"
                          />
                        ) : (
                          <span className="text-muted text-[12px]">—</span>
                        )}
                      </div>
                    </td>
                  )}
                  {!compareOn && (
                    <>
                      <td className="py-3 pr-4 text-right font-mono tabular-nums text-[13px] text-muted hidden md:table-cell">
                        {t.jobs}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono tabular-nums text-[13px] text-muted hidden lg:table-cell">
                        {t.memberships}
                      </td>
                    </>
                  )}
                  <td className="py-3 pr-2 text-right hidden lg:table-cell">
                    <div className="inline-flex">
                      <Sparkline
                        values={t.spark}
                        compareValues={compareOn ? t.lySpark : undefined}
                        width={100}
                        height={24}
                        stroke={t.trend === 'down' ? 'var(--down)' : deptColor}
                        fill="none"
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
