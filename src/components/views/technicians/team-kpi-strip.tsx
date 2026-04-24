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

export function TeamKPIStrip({ team, compareMode }: { team: TeamRollup; compareMode: CompareMode }) {
  const mode = toStatMode(compareMode);
  return (
    <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
      <Panel padding="tight">
        <Stat label="Team revenue" value={team.revenue.value} unit="cents" comparison={team.revenue} compareMode={mode} />
      </Panel>
      <Panel padding="tight">
        <Stat label="Close rate" value={team.closeRate.value} unit="bps" comparison={team.closeRate} compareMode={mode} />
      </Panel>
      <Panel padding="tight">
        <Stat label="Avg sale" value={team.avgSale.value} unit="cents" comparison={team.avgSale} compareMode={mode} />
      </Panel>
      <Panel padding="tight">
        <Stat label="Sales opps" value={team.oppsDone.value} unit="count" comparison={team.oppsDone} compareMode={mode} />
      </Panel>
    </div>
  );
}
