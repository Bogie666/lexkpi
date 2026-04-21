'use client';

import { useQuery } from '@tanstack/react-query';
import type { ApiEnvelope, MembershipsResponse } from '@/lib/types/kpi';
import type { DashboardParams } from '@/lib/state/url-params';

export function useMemberships(params: DashboardParams) {
  const q = {
    preset: params.period,
    from: params.from ?? undefined,
    to: params.to ?? undefined,
    compare: params.compare === 'none' ? undefined : params.compare,
    location: params.location,
  };

  return useQuery<MembershipsResponse>({
    queryKey: ['memberships', q],
    queryFn: async () => {
      const url = new URL('/api/kpi/memberships', window.location.origin);
      Object.entries(q).forEach(([k, v]) => {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      });
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(`Memberships fetch failed: ${res.status}`);
      const json = (await res.json()) as ApiEnvelope<MembershipsResponse>;
      return json.data;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}
