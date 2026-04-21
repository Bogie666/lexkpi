/**
 * Mock /api/kpi/memberships — shape per DATA-SPEC. Counts are integers,
 * prices are whole dollars (not cents — this is the spec intent for display).
 */
import { NextResponse } from 'next/server';
import type { MembershipsResponse } from '@/lib/types/kpi';

export const dynamic = 'force-dynamic';

function build(): MembershipsResponse {
  return {
    active: 8412,
    goal: 10000,
    newMonth: 216,
    churnMonth: 72,
    netMonth: 144,
    newWeek: 58,
    ly:  { active: 7608, newMonth: 184, churnMonth: 68, netMonth: 116 },
    ly2: { active: 6942, newMonth: 158, churnMonth: 62, netMonth: 96  },
    history:   [7200, 7340, 7480, 7605, 7742, 7860, 7982, 8105, 8210, 8296, 8358, 8412],
    lyHistory: [6480, 6602, 6712, 6820, 6925, 7028, 7128, 7218, 7302, 7385, 7468, 7608],
    breakdown: [
      { tier: 'Cool Club',      count: 5180, lyCount: 4820, price: 19, colorToken: '--d-hvac' },
      { tier: 'Cool Club Plus', count: 2344, lyCount: 2068, price: 39, colorToken: '--d-commercial' },
      { tier: 'Total Comfort',  count:  888, lyCount:  720, price: 89, colorToken: '--d-electrical' },
    ],
    meta: {
      period: 'MTD April',
      asOf: new Date().toISOString(),
      from: '2026-04-01',
      to: '2026-04-20',
    },
  };
}

export async function GET() {
  return NextResponse.json({ data: build() });
}
