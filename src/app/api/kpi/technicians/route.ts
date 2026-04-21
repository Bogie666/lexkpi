/**
 * Mock /api/kpi/technicians — shape matches DATA-SPEC §GET /api/kpi/technicians.
 * Data derives from designspecs/data.js, converted to cents/bps. Each role returns
 * a plausible roster of 6–8 technicians pre-sorted by the role's primaryMetric.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { Role, Technician, TechniciansResponse } from '@/lib/types/kpi';

export const dynamic = 'force-dynamic';

const DOLLAR = (n: number) => Math.round(n * 100);
const PCT_TO_BPS = (n: number) => Math.round(n * 100);

const ROLES: Role[] = [
  { code: 'comfort_advisor', name: 'Comfort Advisor', primaryMetric: 'Closed revenue', sortKey: 'revenue' },
  { code: 'hvac_tech', name: 'HVAC Tech', primaryMetric: 'Ticket average', sortKey: 'avgTicket' },
  { code: 'hvac_maintenance', name: 'HVAC Maint.', primaryMetric: 'Jobs completed', sortKey: 'jobs' },
  { code: 'commercial_hvac', name: 'Commercial HVAC', primaryMetric: 'Closed revenue', sortKey: 'revenue' },
  { code: 'plumbing', name: 'Plumbing', primaryMetric: 'Closed revenue', sortKey: 'revenue' },
  { code: 'electrical', name: 'Electrical', primaryMetric: 'Closed revenue', sortKey: 'revenue' },
];

interface TechSeed {
  id: number;
  name: string;
  dept: string;
  revenue: number;
  ly: number;
  closeRate: number;
  lyCloseRate: number;
  jobs: number;
  lyJobs: number;
  avgTicket: number;
  lyAvgTicket: number;
  memberships: number;
  trend: Technician['trend'];
  spark: number[];
  lySpark: number[];
}

const ROSTER: Record<string, TechSeed[]> = {
  comfort_advisor: [
    { id: 101, name: 'Marcus Vega', dept: 'hvac', revenue: 284_500, ly: 241_200, closeRate: 58.2, lyCloseRate: 54.1, jobs: 42, lyJobs: 38, avgTicket: 6_774, lyAvgTicket: 6_348, memberships: 18, trend: 'up', spark: [30, 35, 42, 38, 52, 58, 62, 68, 71, 74], lySpark: [28, 30, 34, 32, 42, 48, 52, 58, 60, 62] },
    { id: 102, name: 'Jenna Rhodes', dept: 'hvac', revenue: 261_200, ly: 218_400, closeRate: 54.1, lyCloseRate: 49.8, jobs: 39, lyJobs: 36, avgTicket: 6_697, lyAvgTicket: 6_067, memberships: 22, trend: 'up', spark: [28, 32, 38, 44, 48, 52, 58, 61, 65, 68], lySpark: [24, 28, 32, 36, 40, 42, 48, 51, 54, 56] },
    { id: 103, name: 'David Okafor', dept: 'hvac', revenue: 218_900, ly: 224_100, closeRate: 51.4, lyCloseRate: 52.8, jobs: 36, lyJobs: 38, avgTicket: 6_080, lyAvgTicket: 5_897, memberships: 14, trend: 'flat', spark: [35, 38, 34, 36, 38, 40, 42, 40, 44, 46], lySpark: [36, 40, 36, 38, 40, 42, 44, 42, 46, 48] },
    { id: 104, name: 'Priya Nair', dept: 'plumbing', revenue: 198_400, ly: 162_800, closeRate: 49.8, lyCloseRate: 45.2, jobs: 48, lyJobs: 42, avgTicket: 4_133, lyAvgTicket: 3_876, memberships: 11, trend: 'up', spark: [22, 24, 28, 30, 32, 36, 38, 41, 44, 48], lySpark: [18, 20, 22, 24, 26, 28, 30, 33, 36, 38] },
    { id: 105, name: 'Tyrell Booker', dept: 'hvac', revenue: 184_200, ly: 198_600, closeRate: 47.2, lyCloseRate: 50.1, jobs: 31, lyJobs: 34, avgTicket: 5_942, lyAvgTicket: 5_841, memberships: 9, trend: 'down', spark: [42, 40, 38, 36, 34, 32, 30, 32, 30, 28], lySpark: [44, 42, 42, 40, 40, 38, 38, 40, 38, 36] },
    { id: 106, name: 'Sofia Lindqvist', dept: 'electrical', revenue: 162_800, ly: 128_400, closeRate: 44.6, lyCloseRate: 40.2, jobs: 44, lyJobs: 38, avgTicket: 3_700, lyAvgTicket: 3_379, memberships: 8, trend: 'up', spark: [18, 20, 24, 28, 30, 34, 36, 38, 42, 44], lySpark: [14, 16, 18, 22, 24, 27, 29, 31, 34, 36] },
    { id: 107, name: 'Kenny Park', dept: 'plumbing', revenue: 148_600, ly: 142_300, closeRate: 42.1, lyCloseRate: 41.8, jobs: 38, lyJobs: 36, avgTicket: 3_910, lyAvgTicket: 3_952, memberships: 6, trend: 'flat', spark: [24, 26, 24, 28, 26, 28, 30, 28, 30, 32], lySpark: [22, 24, 24, 26, 26, 26, 28, 28, 28, 30] },
    { id: 108, name: 'Aisha Martin', dept: 'hvac', revenue: 142_300, ly: 108_200, closeRate: 41.5, lyCloseRate: 36.4, jobs: 29, lyJobs: 26, avgTicket: 4_907, lyAvgTicket: 4_162, memberships: 12, trend: 'up', spark: [20, 22, 24, 26, 28, 30, 32, 34, 36, 38], lySpark: [16, 18, 20, 22, 23, 25, 26, 28, 30, 32] },
  ],
  hvac_tech: [
    { id: 201, name: 'Elijah Brooks', dept: 'hvac', revenue: 148_200, ly: 132_100, closeRate: 38.2, lyCloseRate: 35.4, jobs: 78, lyJobs: 72, avgTicket: 1_900, lyAvgTicket: 1_834, memberships: 31, trend: 'up', spark: [82, 88, 94, 98, 102, 108, 112, 118, 122, 126], lySpark: [72, 78, 84, 88, 92, 96, 100, 106, 110, 114] },
    { id: 202, name: 'Chloe Nakamura', dept: 'hvac', revenue: 134_800, ly: 118_600, closeRate: 36.8, lyCloseRate: 33.1, jobs: 74, lyJobs: 70, avgTicket: 1_822, lyAvgTicket: 1_694, memberships: 28, trend: 'up', spark: [68, 72, 78, 82, 88, 92, 96, 102, 106, 112], lySpark: [62, 66, 72, 76, 80, 84, 88, 94, 98, 102] },
    { id: 203, name: 'Rafael Torres', dept: 'hvac', revenue: 121_500, ly: 118_300, closeRate: 34.2, lyCloseRate: 34.8, jobs: 68, lyJobs: 68, avgTicket: 1_786, lyAvgTicket: 1_740, memberships: 22, trend: 'flat', spark: [72, 74, 72, 76, 78, 76, 80, 78, 82, 80], lySpark: [68, 70, 70, 72, 74, 74, 76, 76, 78, 78] },
    { id: 204, name: 'Morgan Bailey', dept: 'hvac', revenue: 112_400, ly: 98_200, closeRate: 32.8, lyCloseRate: 29.6, jobs: 64, lyJobs: 58, avgTicket: 1_756, lyAvgTicket: 1_693, memberships: 19, trend: 'up', spark: [48, 52, 58, 62, 66, 70, 74, 78, 82, 86], lySpark: [42, 46, 52, 56, 60, 64, 68, 72, 76, 80] },
    { id: 205, name: 'Santiago Ruiz', dept: 'hvac', revenue: 98_700, ly: 104_800, closeRate: 31.2, lyCloseRate: 33.8, jobs: 56, lyJobs: 60, avgTicket: 1_762, lyAvgTicket: 1_747, memberships: 14, trend: 'down', spark: [62, 60, 58, 56, 54, 52, 50, 52, 50, 48], lySpark: [64, 62, 62, 60, 60, 58, 58, 60, 58, 56] },
    { id: 206, name: 'Olivia Carter', dept: 'hvac', revenue: 89_400, ly: 72_800, closeRate: 29.4, lyCloseRate: 26.2, jobs: 51, lyJobs: 45, avgTicket: 1_753, lyAvgTicket: 1_618, memberships: 11, trend: 'up', spark: [32, 36, 40, 44, 48, 52, 56, 60, 64, 68], lySpark: [28, 32, 36, 40, 42, 46, 48, 52, 56, 58] },
  ],
  hvac_maintenance: [
    { id: 301, name: 'Dante Whitaker', dept: 'maintenance', revenue: 42_800, ly: 38_100, closeRate: 22.4, lyCloseRate: 20.8, jobs: 128, lyJobs: 118, avgTicket: 334, lyAvgTicket: 322, memberships: 42, trend: 'up', spark: [18, 20, 24, 26, 28, 30, 32, 34, 36, 38], lySpark: [16, 18, 22, 24, 26, 28, 30, 32, 34, 36] },
    { id: 302, name: 'Harper Quinn', dept: 'maintenance', revenue: 38_400, ly: 34_800, closeRate: 20.2, lyCloseRate: 19.6, jobs: 118, lyJobs: 112, avgTicket: 325, lyAvgTicket: 310, memberships: 38, trend: 'up', spark: [14, 16, 18, 20, 22, 24, 26, 28, 30, 32], lySpark: [12, 14, 16, 18, 20, 22, 24, 26, 28, 30] },
    { id: 303, name: 'Malik Osei', dept: 'maintenance', revenue: 35_200, ly: 36_400, closeRate: 19.8, lyCloseRate: 20.2, jobs: 108, lyJobs: 112, avgTicket: 325, lyAvgTicket: 325, memberships: 32, trend: 'flat', spark: [28, 26, 28, 28, 28, 28, 28, 28, 28, 28], lySpark: [28, 28, 28, 28, 28, 28, 28, 28, 28, 28] },
    { id: 304, name: 'Sienna Reyes', dept: 'maintenance', revenue: 32_800, ly: 29_400, closeRate: 18.6, lyCloseRate: 17.4, jobs: 102, lyJobs: 96, avgTicket: 321, lyAvgTicket: 306, memberships: 30, trend: 'up', spark: [12, 14, 16, 18, 20, 22, 24, 26, 28, 30], lySpark: [10, 12, 14, 16, 18, 20, 22, 24, 26, 28] },
    { id: 305, name: 'Graham Ellis', dept: 'maintenance', revenue: 28_600, ly: 30_100, closeRate: 17.2, lyCloseRate: 18.4, jobs: 94, lyJobs: 98, avgTicket: 304, lyAvgTicket: 307, memberships: 26, trend: 'down', spark: [26, 24, 24, 22, 22, 20, 20, 18, 18, 16], lySpark: [26, 26, 24, 24, 22, 22, 20, 20, 18, 18] },
  ],
  commercial_hvac: [
    { id: 401, name: 'Rhea Chakraborty', dept: 'commercial', revenue: 184_200, ly: 148_600, closeRate: 46.2, lyCloseRate: 42.1, jobs: 24, lyJobs: 22, avgTicket: 7_675, lyAvgTicket: 6_755, memberships: 4, trend: 'up', spark: [18, 22, 26, 30, 34, 38, 42, 46, 50, 54], lySpark: [14, 18, 22, 26, 30, 34, 38, 42, 46, 50] },
    { id: 402, name: 'Jamal Washington', dept: 'commercial', revenue: 162_400, ly: 142_800, closeRate: 44.1, lyCloseRate: 41.8, jobs: 22, lyJobs: 20, avgTicket: 7_382, lyAvgTicket: 7_140, memberships: 3, trend: 'up', spark: [16, 20, 24, 28, 32, 36, 40, 44, 48, 52], lySpark: [14, 16, 20, 24, 28, 32, 36, 40, 44, 48] },
    { id: 403, name: 'Natasha Volkov', dept: 'commercial', revenue: 128_600, ly: 124_200, closeRate: 42.4, lyCloseRate: 43.1, jobs: 18, lyJobs: 19, avgTicket: 7_144, lyAvgTicket: 6_537, memberships: 2, trend: 'flat', spark: [28, 30, 32, 30, 34, 32, 36, 34, 38, 36], lySpark: [28, 28, 30, 32, 32, 32, 34, 34, 36, 36] },
  ],
  plumbing: [
    { id: 501, name: 'Priya Nair', dept: 'plumbing', revenue: 198_400, ly: 162_800, closeRate: 49.8, lyCloseRate: 45.2, jobs: 48, lyJobs: 42, avgTicket: 4_133, lyAvgTicket: 3_876, memberships: 11, trend: 'up', spark: [22, 24, 28, 30, 32, 36, 38, 41, 44, 48], lySpark: [18, 20, 22, 24, 26, 28, 30, 33, 36, 38] },
    { id: 502, name: 'Kenny Park', dept: 'plumbing', revenue: 148_600, ly: 142_300, closeRate: 42.1, lyCloseRate: 41.8, jobs: 38, lyJobs: 36, avgTicket: 3_910, lyAvgTicket: 3_952, memberships: 6, trend: 'flat', spark: [24, 26, 24, 28, 26, 28, 30, 28, 30, 32], lySpark: [22, 24, 24, 26, 26, 26, 28, 28, 28, 30] },
    { id: 503, name: 'Lucia Moreno', dept: 'plumbing', revenue: 132_400, ly: 118_600, closeRate: 39.8, lyCloseRate: 37.2, jobs: 34, lyJobs: 31, avgTicket: 3_894, lyAvgTicket: 3_826, memberships: 5, trend: 'up', spark: [18, 20, 24, 28, 30, 34, 36, 38, 40, 42], lySpark: [16, 18, 22, 26, 28, 30, 32, 34, 36, 38] },
    { id: 504, name: 'Oliver Tran', dept: 'plumbing', revenue: 108_200, ly: 114_800, closeRate: 36.4, lyCloseRate: 38.6, jobs: 30, lyJobs: 32, avgTicket: 3_607, lyAvgTicket: 3_588, memberships: 4, trend: 'down', spark: [32, 30, 28, 28, 26, 26, 24, 24, 22, 22], lySpark: [32, 32, 30, 30, 28, 28, 28, 26, 26, 24] },
  ],
  electrical: [
    { id: 601, name: 'Sofia Lindqvist', dept: 'electrical', revenue: 162_800, ly: 128_400, closeRate: 44.6, lyCloseRate: 40.2, jobs: 44, lyJobs: 38, avgTicket: 3_700, lyAvgTicket: 3_379, memberships: 8, trend: 'up', spark: [18, 20, 24, 28, 30, 34, 36, 38, 42, 44], lySpark: [14, 16, 18, 22, 24, 27, 29, 31, 34, 36] },
    { id: 602, name: 'Idris Bakhtiari', dept: 'electrical', revenue: 118_600, ly: 98_400, closeRate: 38.2, lyCloseRate: 34.8, jobs: 38, lyJobs: 33, avgTicket: 3_121, lyAvgTicket: 2_982, memberships: 6, trend: 'up', spark: [16, 18, 22, 24, 26, 28, 30, 34, 36, 38], lySpark: [12, 14, 18, 20, 22, 24, 26, 30, 32, 34] },
    { id: 603, name: 'Camille Dubois', dept: 'electrical', revenue: 92_400, ly: 84_200, closeRate: 34.6, lyCloseRate: 32.4, jobs: 32, lyJobs: 29, avgTicket: 2_887, lyAvgTicket: 2_904, memberships: 4, trend: 'up', spark: [14, 16, 18, 20, 22, 24, 26, 28, 30, 32], lySpark: [12, 14, 16, 18, 20, 22, 24, 26, 28, 30] },
  ],
};

function toTechnician(s: TechSeed, rank: number): Technician {
  return {
    rank,
    employeeId: s.id,
    name: s.name,
    departmentCode: s.dept,
    photoUrl: null,
    revenue: DOLLAR(s.revenue),
    ly: DOLLAR(s.ly),
    closeRate: PCT_TO_BPS(s.closeRate),
    lyCloseRate: PCT_TO_BPS(s.lyCloseRate),
    jobs: s.jobs,
    lyJobs: s.lyJobs,
    avgTicket: DOLLAR(s.avgTicket),
    lyAvgTicket: DOLLAR(s.lyAvgTicket),
    memberships: s.memberships,
    trend: s.trend,
    spark: s.spark,
    lySpark: s.lySpark,
  };
}

function buildResponse(roleCode: string): TechniciansResponse {
  const role = ROLES.find((r) => r.code === roleCode) ?? ROLES[0];
  const seeds = ROSTER[role.code] ?? ROSTER.comfort_advisor;

  // Sort by role primary metric descending, then rank.
  const sorted = seeds
    .slice()
    .sort((a, b) => {
      switch (role.sortKey) {
        case 'avgTicket':
          return b.avgTicket - a.avgTicket;
        case 'jobs':
          return b.jobs - a.jobs;
        case 'closeRate':
          return b.closeRate - a.closeRate;
        case 'revenue':
        default:
          return b.revenue - a.revenue;
      }
    });

  const technicians = sorted.map((s, i) => toTechnician(s, i + 1));

  const totalRev = technicians.reduce((sum, t) => sum + t.revenue, 0);
  const lyRev = technicians.reduce((sum, t) => sum + (t.ly ?? 0), 0);
  const totalJobs = technicians.reduce((sum, t) => sum + t.jobs, 0);
  const lyJobs = technicians.reduce((sum, t) => sum + (t.lyJobs ?? 0), 0);
  const memberships = technicians.reduce((sum, t) => sum + t.memberships, 0);
  const avgClose =
    technicians.reduce((sum, t) => sum + t.closeRate, 0) / Math.max(technicians.length, 1);
  const lyAvgClose =
    technicians.reduce((sum, t) => sum + (t.lyCloseRate ?? 0), 0) /
    Math.max(technicians.length, 1);
  const avgTicket =
    technicians.reduce((sum, t) => sum + t.avgTicket, 0) / Math.max(technicians.length, 1);
  const lyAvgTicket =
    technicians.reduce((sum, t) => sum + (t.lyAvgTicket ?? 0), 0) /
    Math.max(technicians.length, 1);

  return {
    role,
    roles: ROLES,
    team: {
      revenue: { value: totalRev, ly: lyRev, ly2: Math.round(lyRev * 0.89), unit: 'cents' },
      closeRate: {
        value: Math.round(avgClose),
        ly: Math.round(lyAvgClose),
        ly2: Math.round(lyAvgClose * 0.94),
        unit: 'bps',
      },
      avgTicket: {
        value: Math.round(avgTicket),
        ly: Math.round(lyAvgTicket),
        ly2: Math.round(lyAvgTicket * 0.93),
        unit: 'cents',
      },
      jobsDone: { value: totalJobs, ly: lyJobs, ly2: Math.round(lyJobs * 0.9), unit: 'count' },
      memberships: {
        value: memberships,
        ly: Math.round(memberships * 0.88),
        ly2: Math.round(memberships * 0.76),
        unit: 'count',
      },
    },
    technicians,
    meta: {
      period: 'MTD April',
      asOf: new Date().toISOString(),
      from: '2026-04-01',
      to: '2026-04-20',
    },
  };
}

export async function GET(req: NextRequest) {
  const roleCode = req.nextUrl.searchParams.get('role') ?? 'comfort_advisor';
  return NextResponse.json({ data: buildResponse(roleCode) });
}
