import { Suspense } from 'react';
import { DashboardClient } from './dashboard-client';

// The dashboard is entirely URL-state + client-fetched KPI data. Pre-rendering
// gains nothing and has caused Vercel edge routing to intermittently 503 on
// the static shell. Force dynamic so every request goes through the SSR path.
export const dynamic = 'force-dynamic';

export default function DashboardPage() {
  return (
    <Suspense fallback={null}>
      <DashboardClient />
    </Suspense>
  );
}
