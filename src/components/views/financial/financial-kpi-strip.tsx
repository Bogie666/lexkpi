'use client';

import { Panel } from '@/components/primitives/panel';
import { Stat } from '@/components/primitives/stat';
import type { FinancialResponse } from '@/lib/types/kpi';
import type { CompareMode } from '@/lib/state/url-params';

export interface FinancialKPIStripProps {
  data: FinancialResponse;
  compareMode: CompareMode;
}

function toStatMode(m: CompareMode): 'prev' | 'ly' | 'ly2' | 'none' {
  if (m === 'ly') return 'ly';
  if (m === 'ly2') return 'ly2';
  return 'prev';
}

export function FinancialKPIStrip({ data, compareMode }: FinancialKPIStripProps) {
  const mode = toStatMode(compareMode);
  const k = data.kpis;
  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
      <Panel padding="tight">
        <Stat label="Close rate" value={k.closeRate.value} unit="bps" comparison={k.closeRate} compareMode={mode} />
      </Panel>
      <Panel padding="tight">
        <Stat label="Avg ticket" value={k.avgTicket.value} unit="cents" comparison={k.avgTicket} compareMode={mode} />
      </Panel>
      <Panel padding="tight">
        <Stat label="Opportunities" value={k.opportunities.value} unit="count" comparison={k.opportunities} compareMode={mode} />
      </Panel>
      <Panel padding="tight">
        <Stat label="Memberships" value={k.memberships.value} unit="count" comparison={k.memberships} compareMode={mode} />
      </Panel>
    </div>
  );
}
