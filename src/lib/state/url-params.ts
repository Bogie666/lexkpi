'use client';

import {
  parseAsString,
  parseAsStringEnum,
  useQueryStates,
} from 'nuqs';

export const PRESETS = [
  'today',
  'l7',
  'mtd',
  'qtd',
  'ytd',
  'l30',
  'l90',
  'ttm',
  'last_month',
] as const;
export type Preset = (typeof PRESETS)[number];

export const COMPARE_MODES = ['none', 'prev', 'ly', 'ly2', 'all'] as const;
export type CompareMode = (typeof COMPARE_MODES)[number];

export const TABS = [
  'financial',
  'technicians',
  'operations',
  'engagement',
  'analyze',
  'tools',
] as const;
export type Tab = (typeof TABS)[number];

export const COMPARE_SUPPORTED: Record<Tab, boolean> = {
  financial: true,
  technicians: true,
  operations: true,
  engagement: false,
  analyze: false,
  tools: false,
};

export function useDashboardParams() {
  return useQueryStates(
    {
      tab: parseAsStringEnum([...TABS]).withDefault('financial'),
      period: parseAsStringEnum([...PRESETS]).withDefault('mtd'),
      from: parseAsString,
      to: parseAsString,
      compare: parseAsStringEnum([...COMPARE_MODES]).withDefault('none'),
      role: parseAsString.withDefault('hvac_tech'),
      subtab: parseAsString,
      location: parseAsString.withDefault('all'),
    },
    { history: 'push' },
  );
}

export type DashboardParams = ReturnType<typeof useDashboardParams>[0];
