'use client';

import { cn } from '@/lib/cn';
import { Panel } from '@/components/primitives/panel';
import { ComparePill } from '@/components/primitives/compare-pill';
import { fmtMoney } from '@/lib/format/money';
import { fmtPercent } from '@/lib/format/percent';
import type { Technician } from '@/lib/types/kpi';
import type { CompareMode } from '@/lib/state/url-params';

export interface TechLeaderboardProps {
  technicians: Technician[];
  compareMode: CompareMode;
  roleCode: string;
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

function RankCell({ rank }: { rank: number }) {
  const rankKey = rank <= 3 ? String(rank) : 'n';
  return (
    <td className="py-3 pr-4">
      <span
        className={cn(
          'inline-flex items-center justify-center h-7 w-10 rounded-pill border text-[12px] font-mono tabular-nums font-medium',
          RANK_CLS[rankKey],
        )}
      >
        #{rank}
      </span>
    </td>
  );
}

function TechCell({ tech }: { tech: Technician }) {
  const deptColor = `var(--d-${tech.departmentCode})`;
  return (
    <td className="py-3 pr-4">
      <div className="flex items-center gap-3 min-w-0">
        <span
          className="shrink-0 h-8 w-8 rounded-full grid place-items-center text-[11px] font-mono font-medium overflow-hidden"
          style={{
            background: `color-mix(in oklch, ${deptColor} 22%, var(--surface-2))`,
            border: `1px solid var(--border)`,
            color: deptColor,
          }}
          aria-hidden
        >
          {tech.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={tech.photoUrl}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            initials(tech.name)
          )}
        </span>
        <div className="flex flex-col min-w-0">
          <span className="text-[13px] font-medium truncate">{tech.name}</span>
          <span className="text-[11px] text-muted capitalize">
            {tech.departmentCode.replace('_', ' ')}
          </span>
        </div>
        <span
          aria-hidden
          className="h-2 w-2 rounded-full shrink-0 ml-auto md:ml-0"
          style={{ background: deptColor }}
        />
      </div>
    </td>
  );
}

export function TechLeaderboard({ technicians, compareMode, roleCode }: TechLeaderboardProps) {
  const compareOn = compareMode === 'ly' || compareMode === 'ly2';
  const isCA = roleCode === 'comfort_advisor';

  return (
    <Panel eyebrow="Leaderboard" title="Performance by technician" padding="cozy">
      <div className="overflow-x-auto -mx-2 px-2">
        {isCA ? (
          <CAColumns technicians={technicians} compareMode={compareMode} compareOn={compareOn} />
        ) : (
          <TechColumns technicians={technicians} compareMode={compareMode} compareOn={compareOn} />
        )}
      </div>
    </Panel>
  );
}

/* ─── Comfort Advisor: Revenue | Close | Avg Sale | Opps | Options ────────── */

function CAColumns({
  technicians,
  compareMode,
  compareOn,
}: {
  technicians: Technician[];
  compareMode: CompareMode;
  compareOn: boolean;
}) {
  return (
    <table className="w-full text-left">
      <thead>
        <tr className="col-head border-b border-border">
          <th className="py-2 pr-4 font-normal w-[60px]">Rank</th>
          <th className="py-2 pr-4 font-normal">Technician</th>
          <th className="py-2 pr-4 font-normal text-right">Revenue</th>
          {compareOn && <th className="py-2 pr-4 font-normal text-right hidden lg:table-cell">Δ Rev</th>}
          <th className="py-2 pr-4 font-normal text-right hidden md:table-cell">Close</th>
          {compareOn && <th className="py-2 pr-4 font-normal text-right hidden lg:table-cell">Δ Close</th>}
          <th className="py-2 pr-4 font-normal text-right hidden md:table-cell">Avg sale</th>
          {compareOn && <th className="py-2 pr-4 font-normal text-right hidden lg:table-cell">Δ Sale</th>}
          {!compareOn && (
            <>
              <th className="py-2 pr-4 font-normal text-right hidden md:table-cell">Opps</th>
              <th className="py-2 pr-4 font-normal text-right hidden lg:table-cell">Options</th>
            </>
          )}
        </tr>
      </thead>
      <tbody>
        {technicians.map((t) => (
          <tr
            key={t.employeeId}
            className="border-b border-border/60 last:border-0 hover:bg-surface-2/20 transition-colors"
          >
            <RankCell rank={t.rank} />
            <TechCell tech={t} />
            <td
              className={cn(
                'py-3 pr-4 text-right font-mono tabular-nums text-[14px] font-semibold',
                t.rank === 1 && 'text-accent',
              )}
            >
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
            <td
              className={cn(
                'py-3 pr-4 text-right font-mono tabular-nums text-[13px] hidden md:table-cell',
                t.closeRate >= 4500 && 'text-up',
                t.closeRate < 2500 && 'text-warning',
              )}
            >
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
              {fmtMoney(t.avgSale)}
            </td>
            {compareOn && (
              <td className="py-3 pr-4 text-right hidden lg:table-cell">
                <div className="flex justify-end">
                  {t.lyAvgSale !== undefined ? (
                    <ComparePill
                      current={t.avgSale}
                      comparison={t.lyAvgSale}
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
                  {t.opps}
                </td>
                <td className="py-3 pr-4 text-right font-mono tabular-nums text-[13px] text-muted hidden lg:table-cell">
                  {(t.options / 100).toFixed(1)}
                </td>
              </>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ─── Non-CA: Revenue | Close | Avg Ticket | Jobs | Opps | Flips | Flip $ | Members ── */

function TechColumns({
  technicians,
  compareMode,
  compareOn,
}: {
  technicians: Technician[];
  compareMode: CompareMode;
  compareOn: boolean;
}) {
  return (
    <table className="w-full text-left">
      <thead>
        <tr className="col-head border-b border-border">
          <th className="py-2 pr-4 font-normal w-[60px]">Rank</th>
          <th className="py-2 pr-4 font-normal">Technician</th>
          <th className="py-2 pr-4 font-normal text-right">Revenue</th>
          {compareOn && <th className="py-2 pr-4 font-normal text-right hidden lg:table-cell">Δ Rev</th>}
          <th className="py-2 pr-4 font-normal text-right hidden md:table-cell">Close</th>
          {compareOn && <th className="py-2 pr-4 font-normal text-right hidden lg:table-cell">Δ Close</th>}
          <th className="py-2 pr-4 font-normal text-right hidden md:table-cell">Avg ticket</th>
          {!compareOn && (
            <>
              <th className="py-2 pr-3 font-normal text-right hidden md:table-cell">Jobs</th>
              <th className="py-2 pr-3 font-normal text-right hidden lg:table-cell">Opps</th>
              <th className="py-2 pr-3 font-normal text-right hidden lg:table-cell">Flips</th>
              <th className="py-2 pr-3 font-normal text-right hidden lg:table-cell">Flip $</th>
              <th className="py-2 pr-2 font-normal text-right hidden lg:table-cell">Members</th>
            </>
          )}
        </tr>
      </thead>
      <tbody>
        {technicians.map((t) => (
          <tr
            key={t.employeeId}
            className="border-b border-border/60 last:border-0 hover:bg-surface-2/20 transition-colors"
          >
            <RankCell rank={t.rank} />
            <TechCell tech={t} />
            <td
              className={cn(
                'py-3 pr-4 text-right font-mono tabular-nums text-[14px] font-semibold',
                t.rank === 1 && 'text-accent',
              )}
            >
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
            <td
              className={cn(
                'py-3 pr-4 text-right font-mono tabular-nums text-[13px] hidden md:table-cell',
                t.closeRate >= 4500 && 'text-up',
                t.closeRate < 2500 && 'text-warning',
              )}
            >
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
            {!compareOn && (
              <>
                <td className="py-3 pr-3 text-right font-mono tabular-nums text-[13px] text-muted hidden md:table-cell">
                  {t.jobs}
                </td>
                <td className="py-3 pr-3 text-right font-mono tabular-nums text-[13px] text-muted hidden lg:table-cell">
                  {t.opps}
                </td>
                <td className="py-3 pr-3 text-right font-mono tabular-nums text-[13px] text-muted hidden lg:table-cell">
                  {t.flips}
                </td>
                <td className="py-3 pr-3 text-right font-mono tabular-nums text-[13px] text-muted hidden lg:table-cell">
                  {fmtMoney(t.flipSales)}
                </td>
                <td className="py-3 pr-2 text-right font-mono tabular-nums text-[13px] text-muted hidden lg:table-cell">
                  {t.members}
                </td>
              </>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
