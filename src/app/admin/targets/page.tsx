import { Suspense } from 'react';
import { TargetsClient } from './targets-client';

export const dynamic = 'force-dynamic';

export default function AdminTargetsPage() {
  return (
    <Suspense fallback={null}>
      <TargetsClient />
    </Suspense>
  );
}
