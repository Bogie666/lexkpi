'use client';

import { useQuery } from '@tanstack/react-query';
import type { ApiEnvelope, TechniciansResponse } from '@/lib/types/kpi';
import type { DashboardParams } from '@/lib/state/url-params';

export function useTechnicians(params: DashboardParams) {
  const q = {
    role: params.role,
    preset: params.period,
    from: params.from ?? undefined,
    to: params.to ?? undefined,
    compare: params.compare === 'none' ? undefined : params.compare,
    location: params.location,
  };

  return useQuery<TechniciansResponse>({
    queryKey: ['technicians', q],
    queryFn: async () => {
      const url = new URL('/api/kpi/technicians', window.location.origin);
      Object.entries(q).forEach(([k, v]) => {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      });
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(`Technicians fetch failed: ${res.status}`);
      const json = (await res.json()) as ApiEnvelope<TechniciansResponse>;
      return json.data;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}
