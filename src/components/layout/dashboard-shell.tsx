'use client';

import { useDashboardParams } from '@/lib/state/url-params';
import { NavBar } from './nav-bar';

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [params, setParams] = useDashboardParams();

  return (
    <div className="min-h-screen bg-bg text-text">
      <NavBar
        activeTab={params.tab}
        onTabChange={(t) => setParams({ tab: t })}
        compareMode={params.compare}
        onCompareChange={(m) => setParams({ compare: m })}
      />
      <main className="px-[var(--density-pad-x)] py-[var(--density-pad-y)]">
        {children}
      </main>
    </div>
  );
}
