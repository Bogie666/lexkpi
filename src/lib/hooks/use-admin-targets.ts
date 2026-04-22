'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAdminSecret } from './use-admin-secret';

export interface TargetRow {
  id: number;
  metric: string;
  scope: 'company' | 'department' | 'role' | 'employee';
  scopeValue: string | null;
  effectiveFrom: string;
  effectiveTo: string;
  targetValue: number;
  unit: 'cents' | 'bps' | 'count';
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TargetUpsertInput {
  metric: string;
  scope: TargetRow['scope'];
  scopeValue: string | null;
  effectiveFrom: string;
  effectiveTo: string;
  targetValue: number;
  unit: TargetRow['unit'];
  notes?: string | null;
}

export function useTargetsList() {
  const { secret, authHeaders } = useAdminSecret();
  return useQuery<TargetRow[]>({
    queryKey: ['admin-targets'],
    enabled: !!secret,
    queryFn: async () => {
      const res = await fetch('/api/admin/targets', { headers: authHeaders() });
      if (!res.ok) throw new Error(`Targets fetch failed: ${res.status}`);
      const json = (await res.json()) as { rows: TargetRow[] };
      return json.rows;
    },
    staleTime: 10_000,
  });
}

export function useTargetUpsert() {
  const { authHeaders } = useAdminSecret();
  const qc = useQueryClient();
  return useMutation<TargetRow, Error, TargetUpsertInput>({
    mutationFn: async (input) => {
      const res = await fetch('/api/admin/targets', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Upsert failed (${res.status}): ${text.slice(0, 200)}`);
      }
      const json = (await res.json()) as { row: TargetRow };
      return json.row;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-targets'] }),
  });
}

export function useTargetDelete() {
  const { authHeaders } = useAdminSecret();
  const qc = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: async (id) => {
      const res = await fetch(`/api/admin/targets?id=${id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Delete failed (${res.status}): ${text.slice(0, 200)}`);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-targets'] }),
  });
}
