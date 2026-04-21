/**
 * Mock /api/kpi/financial — returns data shaped per DATA-SPEC §GET /api/kpi/financial.
 * Values are in the real units (cents / bps / count) so the UI is exercised as it will be
 * when the real Drizzle-backed handler lands. Data is derived from designspecs/data.js.
 *
 * When the real backend arrives, replace this file with the handler from DATA-SPEC;
 * the response contract is identical.
 */
import { NextResponse } from 'next/server';
import type { FinancialResponse } from '@/lib/types/kpi';

const DOLLAR = (n: number) => Math.round(n * 100);

export const dynamic = 'force-dynamic';

function buildMock(): FinancialResponse {
  const total = DOLLAR(2_847_320);
  const prev = DOLLAR(2_612_840);
  const ly = DOLLAR(2_484_100);
  const ly2 = DOLLAR(2_218_400);
  const target = DOLLAR(3_200_000);

  const departments = [
    {
      code: 'hvac',
      name: 'HVAC',
      colorToken: '--d-hvac',
      revenue: { value: DOLLAR(1_284_500), prev: DOLLAR(1_198_200), ly: DOLLAR(1_102_400), ly2: DOLLAR(986_500), unit: 'cents' as const },
      target: DOLLAR(1_450_000),
      jobs: 268,
      opportunities: 612,
      spark: [78, 82, 74, 91, 88, 95, 102, 96, 88, 92, 105, 112, 108, 118, 121, 115, 124, 131, 128, 135],
      lySpark: [68, 72, 68, 80, 78, 82, 88, 84, 78, 82, 90, 95, 92, 98, 102, 98, 104, 108, 106, 112],
    },
    {
      code: 'plumbing',
      name: 'Plumbing',
      colorToken: '--d-plumbing',
      revenue: { value: DOLLAR(712_480), prev: DOLLAR(684_100), ly: DOLLAR(648_200), ly2: DOLLAR(601_100), unit: 'cents' as const },
      target: DOLLAR(780_000),
      jobs: 142,
      opportunities: 288,
      spark: [42, 38, 45, 52, 48, 44, 51, 56, 52, 49, 58, 61, 57, 64, 62, 66, 68, 65, 71, 68],
      lySpark: [38, 36, 40, 46, 44, 42, 46, 50, 48, 46, 52, 54, 52, 58, 56, 60, 60, 58, 63, 60],
    },
    {
      code: 'electrical',
      name: 'Electrical',
      colorToken: '--d-electrical',
      revenue: { value: DOLLAR(428_900), prev: DOLLAR(412_600), ly: DOLLAR(396_500), ly2: DOLLAR(358_200), unit: 'cents' as const },
      target: DOLLAR(520_000),
      jobs: 98,
      opportunities: 224,
      spark: [22, 25, 21, 28, 26, 24, 30, 27, 32, 29, 34, 31, 36, 33, 38, 35, 37, 40, 42, 41],
      lySpark: [20, 22, 20, 26, 24, 22, 27, 25, 28, 26, 30, 28, 32, 30, 34, 32, 33, 35, 37, 36],
    },
    {
      code: 'commercial',
      name: 'Commercial HVAC',
      colorToken: '--d-commercial',
      revenue: { value: DOLLAR(294_220), prev: DOLLAR(218_940), ly: DOLLAR(209_800), ly2: DOLLAR(178_400), unit: 'cents' as const },
      target: DOLLAR(300_000),
      jobs: 38,
      opportunities: 72,
      spark: [8, 12, 10, 14, 11, 16, 14, 18, 22, 20, 24, 21, 26, 23, 28, 25, 27, 30, 29, 32],
      lySpark: [6, 9, 8, 11, 9, 12, 11, 14, 16, 15, 18, 16, 20, 18, 21, 19, 21, 22, 22, 24],
    },
    {
      code: 'maintenance',
      name: 'Maintenance',
      colorToken: '--d-maintenance',
      revenue: { value: DOLLAR(127_220), prev: DOLLAR(99_000), ly: DOLLAR(127_200), ly2: DOLLAR(94_200), unit: 'cents' as const },
      target: DOLLAR(150_000),
      jobs: 184,
      opportunities: 201,
      spark: [4, 5, 6, 5, 7, 6, 8, 7, 9, 8, 10, 9, 11, 10, 12, 11, 12, 13, 12, 14],
      lySpark: [4, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 11, 12, 12, 12, 12, 13],
    },
  ];

  // Cumulative daily revenue (running total) — matches the designspec shape.
  const trendRaw = [
    [1, 78_000, 68_000, 60_000, 106_666],
    [2, 142_000, 124_000, 110_000, 213_333],
    [3, 221_000, 192_000, 171_000, 320_000],
    [4, 312_000, 272_000, 242_000, 426_666],
    [5, 401_000, 349_000, 312_000, 533_333],
    [6, 498_000, 434_000, 387_000, 640_000],
    [7, 582_000, 507_000, 452_000, 746_666],
    [8, 671_000, 584_000, 521_000, 853_333],
    [9, 764_000, 665_000, 593_000, 960_000],
    [10, 851_000, 741_000, 661_000, 1_066_666],
    [11, 947_000, 824_000, 735_000, 1_173_333],
    [12, 1_048_000, 912_000, 814_000, 1_280_000],
    [13, 1_142_000, 994_000, 887_000, 1_386_666],
    [14, 1_241_000, 1_080_000, 964_000, 1_493_333],
    [15, 1_348_000, 1_173_000, 1_047_000, 1_600_000],
    [16, 1_463_000, 1_273_000, 1_136_000, 1_706_666],
    [17, 1_582_000, 1_377_000, 1_228_000, 1_813_333],
    [18, 1_698_000, 1_478_000, 1_319_000, 1_920_000],
    [19, 1_821_000, 1_585_000, 1_414_000, 2_026_666],
    [20, 2_847_320, 2_484_100, 2_218_400, 2_133_333],
  ];

  const trend = trendRaw.map(([day, actual, lyV, ly2V, tgt]) => ({
    date: `2026-04-${String(day).padStart(2, '0')}`,
    actual: DOLLAR(actual),
    ly: DOLLAR(lyV),
    ly2: DOLLAR(ly2V),
    target: DOLLAR(tgt),
  }));

  return {
    total: {
      revenue: { value: total, prev, ly, ly2, unit: 'cents' },
      target,
      percentToGoal: Math.round((total / target) * 10000),
    },
    departments,
    trend,
    kpis: {
      // close rate as bps: 42.8% = 4280
      closeRate: { value: 4280, prev: 3940, ly: 3820, ly2: 3590, unit: 'bps' },
      avgTicket: { value: DOLLAR(1_284), prev: DOLLAR(1_198), ly: DOLLAR(1_142), ly2: DOLLAR(1_068), unit: 'cents' },
      opportunities: { value: 2156, prev: 2021, ly: 1882, ly2: 1704, unit: 'count' },
      memberships: { value: 8412, prev: 8196, ly: 7608, ly2: 6942, unit: 'count' },
    },
    potential: {
      total: DOLLAR(1_842_000),
      byDept: [
        { code: 'hvac', name: 'HVAC', value: DOLLAR(982_000) },
        { code: 'plumbing', name: 'Plumbing', value: DOLLAR(412_000) },
        { code: 'electrical', name: 'Electrical', value: DOLLAR(268_000) },
        { code: 'commercial', name: 'Commercial HVAC', value: DOLLAR(180_000) },
      ],
    },
    meta: {
      period: 'MTD April',
      asOf: new Date().toISOString(),
      from: '2026-04-01',
      to: '2026-04-20',
    },
  };
}

export async function GET() {
  return NextResponse.json({ data: buildMock() });
}
