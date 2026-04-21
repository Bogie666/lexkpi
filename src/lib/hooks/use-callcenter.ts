'use client';

import { useQuery } from '@tanstack/react-query';
import type { ApiEnvelope, CallCenterResponse } from '@/lib/types/kpi';
import type { DashboardParams } from '@/lib/state/url-params';

export function useCallCenter(params: DashboardParams) {
  const q = {
    preset: params.period,
    from: params.from ?? undefined,
    to: params.to ?? undefined,
    compare: params.compare === 'none' ? undefined : params.compare,
    location: params.location,
  };

  return useQuery<CallCenterResponse>({
    queryKey: ['callcenter', q],
    queryFn: async () => {
      const url = new URL('/api/kpi/callcenter', window.location.origin);
      Object.entries(q).forEach(([k, v]) => {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      });
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(`Call center fetch failed: ${res.status}`);
      const json = (await res.json()) as ApiEnvelope<CallCenterResponse>;
      return json.data;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}
