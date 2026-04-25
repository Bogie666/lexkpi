'use client';

import { Panel } from '@/components/primitives/panel';
import { Stat } from '@/components/primitives/stat';
import type { TeamRollup } from '@/lib/types/kpi';
import type { CompareMode } from '@/lib/state/url-params';

function toStatMode(m: CompareMode): 'prev' | 'ly' | 'ly2' | 'none' {
  if (m === 'ly') return 'ly';
  if (m === 'ly2') return 'ly2';
  return 'prev';
}

/**
 * Role → CSS dept-color token. Lets each tech tab carry a hint of
 * its trade's color across the KPI strip without overwhelming the page.
 */
const ROLE_COLOR: Record<string, string> = {
  hvac_tech: '--d-hvac_service',
  comfort_advisor: '--d-hvac_sales',
  hvac_maintenance: '--d-hvac_maintenance',
  plumbing: '--d-plumbing',
  electrical: '--d-electrical',
  commercial_hvac: '--d-commercial',
};

function AccentPanel({
  color,
  children,
}: {
  color: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <Panel padding="tight" className="relative overflow-hidden">
        {/* Soft top stripe in the role's color — visible identity, easy
            to ignore. 2px is plenty without being a billboard. */}
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-[2px]"
          style={{ background: `var(${color})`, opacity: 0.85 }}
        />
        {children}
      </Panel>
    </div>
  );
}

export function TeamKPIStrip({
  team,
  compareMode,
  roleCode,
}: {
  team: TeamRollup;
  compareMode: CompareMode;
  roleCode: string;
}) {
  const mode = toStatMode(compareMode);
  const isCA = roleCode === 'comfort_advisor';
  const color = ROLE_COLOR[roleCode] ?? '--d-hvac_service';

  return (
    <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
      <AccentPanel color={color}>
        <Stat label="Team revenue" value={team.revenue.value} unit="cents" comparison={team.revenue} compareMode={mode} />
      </AccentPanel>
      <AccentPanel color={color}>
        <Stat label="Close rate" value={team.closeRate.value} unit="bps" comparison={team.closeRate} compareMode={mode} />
      </AccentPanel>
      {isCA ? (
        <>
          <AccentPanel color={color}>
            <Stat label="Avg sale" value={team.avgSale.value} unit="cents" comparison={team.avgSale} compareMode={mode} />
          </AccentPanel>
          <AccentPanel color={color}>
            <Stat label="Sales opps" value={team.oppsDone.value} unit="count" comparison={team.oppsDone} compareMode={mode} />
          </AccentPanel>
        </>
      ) : (
        <>
          <AccentPanel color={color}>
            <Stat label="Avg ticket" value={team.avgTicket.value} unit="cents" comparison={team.avgTicket} compareMode={mode} />
          </AccentPanel>
          <AccentPanel color={color}>
            <Stat label="Jobs completed" value={team.jobsDone.value} unit="count" comparison={team.jobsDone} compareMode={mode} />
          </AccentPanel>
        </>
      )}
    </div>
  );
}
