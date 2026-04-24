'use client';

import { useQuery } from '@tanstack/react-query';
import type { UpcomingAppointmentsResponse } from '@/app/api/kpi/upcoming-appointments/route';

interface Envelope {
  data: UpcomingAppointmentsResponse;
}

export function useUpcomingAppointments() {
  return useQuery<UpcomingAppointmentsResponse>({
    queryKey: ['upcoming-appointments'],
    queryFn: async () => {
      const res = await fetch('/api/kpi/upcoming-appointments');
      if (!res.ok) throw new Error(`Upcoming appointments fetch failed: ${res.status}`);
      const json = (await res.json()) as Envelope;
      return json.data;
    },
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
}
