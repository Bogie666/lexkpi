'use client';

import { useQuery } from '@tanstack/react-query';
import type { ApiEnvelope, AnalyzeResponse } from '@/lib/types/kpi';
import type { DashboardParams } from '@/lib/state/url-params';

/**
 * Analyze view is always trailing-12-months — its seasonality chart and
 * tier/TTC rollups need a year of history to be meaningful, regardless
 * of whichever dashboard-wide period is currently selected. We ignore
 * params.period and explicitly request TTM here.
 */
export function useEstimates(params: DashboardParams) {
  const q = {
    preset: 'ttm',
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
