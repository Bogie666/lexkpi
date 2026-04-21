'use client';

import { DashboardShell } from '@/components/layout/dashboard-shell';
import { useDashboardParams } from '@/lib/state/url-params';
import { FinancialView } from '@/components/views/financial/financial-view';
import { PlaceholderView } from '@/components/views/placeholder-view';

export function DashboardClient() {
  const [params] = useDashboardParams();

  return (
    <DashboardShell>
      {params.tab === 'financial' && <FinancialView />}
      {params.tab === 'technicians' && (
        <PlaceholderView
          title="Technicians"
          description="Role sub-tabs · podium · full leaderboard grid. Spec in UI-SPEC §5.4."
        />
      )}
      {params.tab === 'operations' && (
        <PlaceholderView
          title="Operations"
          description="Call Center and Memberships sub-tabs. UI-SPEC §5.5."
        />
      )}
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
