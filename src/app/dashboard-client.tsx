'use client';

import { DashboardShell } from '@/components/layout/dashboard-shell';
import { useDashboardParams } from '@/lib/state/url-params';
import { FinancialView } from '@/components/views/financial/financial-view';
import { AppointmentsView } from '@/components/views/appointments/appointments-view';
import { TechniciansView } from '@/components/views/technicians/technicians-view';
import { OperationsView } from '@/components/views/operations/operations-view';
import { AnalyzeView } from '@/components/views/analyze/analyze-view';
import { EngagementView } from '@/components/views/engagement/engagement-view';
import { ToolsView } from '@/components/views/tools/tools-view';

export function DashboardClient() {
  const [params] = useDashboardParams();

  return (
    <DashboardShell>
      {params.tab === 'financial' && <FinancialView />}
      {params.tab === 'appointments' && <AppointmentsView />}
      {params.tab === 'technicians' && <TechniciansView />}
      {params.tab === 'operations' && <OperationsView />}
      {params.tab === 'engagement' && <EngagementView />}
      {params.tab === 'analyze' && <AnalyzeView />}
      {params.tab === 'tools' && <ToolsView />}
    </DashboardShell>
  );
}
