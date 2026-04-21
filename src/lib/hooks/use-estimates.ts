'use client';

import { useQuery } from '@tanstack/react-query';
import type { ApiEnvelope, AnalyzeResponse } from '@/lib/types/kpi';
import type { DashboardParams } from '@/lib/state/url-params';

export function useEstimates(params: DashboardParams) {
  const q = {
    preset: params.period === 'mtd' ? 'ttm' : params.period,
    from: params.from ?? undefined,
    to: params.to ?? undefined,
    location: params.location,
  };

  return useQuery<AnalyzeResponse>({
    queryKey: ['estimates', q],
    queryFn: async () => {
      const url = new URL('/api/kpi/estimates', window.location.origin);
      Object.entries(q).forEach(([k, v]) => {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      });
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(`Estimates fetch failed: ${res.status}`);
      const json = (await res.json()) as ApiEnvelope<AnalyzeResponse>;
      return json.data;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}
