'use client';

import { DashboardShell } from '@/components/layout/dashboard-shell';
import { useDashboardParams } from '@/lib/state/url-params';
import { FinancialView } from '@/components/views/financial/financial-view';
import { TechniciansView } from '@/components/views/technicians/technicians-view';
import { OperationsView } from '@/components/views/operations/operations-view';
import { PlaceholderView } from '@/components/views/placeholder-view';

export function DashboardClient() {
  const [params] = useDashboardParams();

  return (
    <DashboardShell>
      {params.tab === 'financial' && <FinancialView />}
      {params.tab === 'technicians' && <TechniciansView />}
      {params.tab === 'operations' && <OperationsView />}
      {params.tab === 'engagement' && (
        <PlaceholderView
          title="Engagement"
          description="Reviews and Top Performers sub-tabs. UI-SPEC §5.6."
        />
      )}
      {params.tab === 'analyze' && (
        <PlaceholderView
          title="Analyze"
          description="Seasonality combo chart, tier selection, time-to-close, dept breakdown. UI-SPEC §5.7."
        />
      )}
      {params.tab === 'tools' && (
        <PlaceholderView
          title="Tools"
          description="Auto-fit card grid with status badges. UI-SPEC §5.8."
        />
      )}
    </DashboardShell>
  );
}
