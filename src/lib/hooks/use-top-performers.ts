'use client';

import { useQuery } from '@tanstack/react-query';
import type { ApiEnvelope, Technician } from '@/lib/types/kpi';
import type { DashboardParams } from '@/lib/state/url-params';

export interface TopPerformersResponse {
  performers: Technician[];
  meta: { period: string; asOf: string; from: string; to: string };
}

export function useTopPerformers(params: DashboardParams, limit = 10) {
  const q = {
    limit,
    preset: params.period,
    from: params.from ?? undefined,
    to: params.to ?? undefined,
  };
  return useQuery<TopPerformersResponse>({
    queryKey: ['top-performers', q],
    queryFn: async () => {
      const url = new URL('/api/kpi/top-performers', window.location.origin);
      Object.entries(q).forEach(([k, v]) => {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      });
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(`Top performers fetch failed: ${res.status}`);
      const json = (await res.json()) as ApiEnvelope<TopPerformersResponse>;
      return json.data;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
