/**
 * Seed inputs — totals for MTD April 2026 and its LY (2025) + LY2 (2024)
 * siblings. Numbers track the mock responses so the dashboard displays
 * byte-identical values after seeding, proving the read path end-to-end.
 */

export interface DeptSeed {
  code: string;
  name: string;
  colorToken: string;
  sortOrder: number;
  /** MTD revenue in dollars for current, LY, LY2. */
  revenue: { cur: number; ly: number; ly2: number };
  /** Relative daily weights — 20 values, one per day. */
  spark: number[];
  lySpark: number[];
  ly2Spark?: number[];
  jobs: number;
  opportunities: number;
  monthlyTargetDollars: number;
}

export const DEPARTMENTS: DeptSeed[] = [
  {
    code: 'hvac_service',
    name: 'HVAC Service',
    colorToken: '--d-hvac_service',
    sortOrder: 10,
    revenue: { cur: 742_000, ly: 640_000, ly2: 572_000 },
    spark: [42, 44, 40, 50, 48, 52, 56, 53, 48, 50, 58, 62, 60, 65, 67, 64, 68, 72, 70, 74],
    lySpark: [38, 40, 38, 44, 43, 46, 48, 46, 43, 45, 50, 53, 51, 54, 56, 54, 57, 59, 58, 62],
    jobs: 180,
    opportunities: 412,
    monthlyTargetDollars: 175_000,
  },
  {
    code: 'hvac_sales',
    name: 'HVAC Sales',
    colorToken: '--d-hvac_sales',
    sortOrder: 20,
    revenue: { cur: 542_500, ly: 462_400, ly2: 414_500 },
    spark: [36, 38, 34, 41, 40, 43, 46, 43, 40, 42, 47, 50, 48, 53, 54, 51, 56, 59, 58, 61],
    lySpark: [30, 32, 30, 36, 35, 36, 40, 38, 35, 37, 40, 43, 41, 44, 46, 44, 47, 49, 48, 50],
    jobs: 88,
    opportunities: 200,
    monthlyTargetDollars: 1_240_000,
  },
  {
    code: 'hvac_maintenance',
    name: 'HVAC Maintenance',
    colorToken: '--d-hvac_maintenance',
    sortOrder: 30,
    revenue: { cur: 127_220, ly: 127_200, ly2: 94_200 },
    spark: [4, 5, 6, 5, 7, 6, 8, 7, 9, 8, 10, 9, 11, 10, 12, 11, 12, 13, 12, 14],
    lySpark: [4, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 11, 12, 12, 12, 12, 13],
    jobs: 184,
    opportunities: 201,
    monthlyTargetDollars: 250_000,
  },
  {
    code: 'plumbing',
    name: 'Plumbing',
    colorToken: '--d-plumbing',
    sortOrder: 40,
    revenue: { cur: 712_480, ly: 648_200, ly2: 601_100 },
    spark: [42, 38, 45, 52, 48, 44, 51, 56, 52, 49, 58, 61, 57, 64, 62, 66, 68, 65, 71, 68],
    lySpark: [38, 36, 40, 46, 44, 42, 46, 50, 48, 46, 52, 54, 52, 58, 56, 60, 60, 58, 63, 60],
    jobs: 142,
    opportunities: 288,
    monthlyTargetDollars: 275_000,
  },
  {
    code: 'commercial',
    name: 'Commercial',
    colorToken: '--d-commercial',
    sortOrder: 50,
    revenue: { cur: 294_220, ly: 209_800, ly2: 178_400 },
    spark: [8, 12, 10, 14, 11, 16, 14, 18, 22, 20, 24, 21, 26, 23, 28, 25, 27, 30, 29, 32],
    lySpark: [6, 9, 8, 11, 9, 12, 11, 14, 16, 15, 18, 16, 20, 18, 21, 19, 21, 22, 22, 24],
    jobs: 38,
    opportunities: 72,
    monthlyTargetDollars: 100_000,
  },
  {
    code: 'electrical',
    name: 'Electrical',
    colorToken: '--d-electrical',
    sortOrder: 60,
    revenue: { cur: 428_900, ly: 396_500, ly2: 358_200 },
    spark: [22, 25, 21, 28, 26, 24, 30, 27, 32, 29, 34, 31, 36, 33, 38, 35, 37, 40, 42, 41],
    lySpark: [20, 22, 20, 26, 24, 22, 27, 25, 28, 26, 30, 28, 32, 30, 34, 32, 33, 35, 37, 36],
    jobs: 98,
    opportunities: 224,
    monthlyTargetDollars: 40_000,
  },
  {
    code: 'etx',
    name: 'ETX',
    colorToken: '--d-etx',
    sortOrder: 70,
    revenue: { cur: 82_000, ly: 68_000, ly2: 54_000 },
    spark: [4, 5, 3, 6, 5, 4, 6, 7, 5, 6, 8, 6, 7, 9, 7, 8, 10, 8, 9, 11],
    lySpark: [3, 4, 3, 5, 4, 3, 5, 6, 4, 5, 6, 5, 6, 7, 6, 7, 8, 7, 7, 9],
    jobs: 28,
    opportunities: 52,
    monthlyTargetDollars: 136_000,
  },
];

// ─── Technician roles ───────────────────────────────────────────────────────

export interface RoleSeed {
  code: string;
  name: string;
  primaryMetric: 'revenue' | 'avgTicket' | 'jobs' | 'closeRate';
  primaryMetricLabel: string;
  sortOrder: number;
}

export const ROLES: RoleSeed[] = [
  { code: 'comfort_advisor', name: 'Comfort Advisor', primaryMetric: 'revenue', primaryMetricLabel: 'Closed revenue', sortOrder: 10 },
  { code: 'hvac_tech', name: 'HVAC Tech', primaryMetric: 'revenue', primaryMetricLabel: 'Closed revenue', sortOrder: 20 },
  { code: 'hvac_maintenance', name: 'HVAC Maint.', primaryMetric: 'revenue', primaryMetricLabel: 'Closed revenue', sortOrder: 30 },
  { code: 'commercial_hvac', name: 'Commercial HVAC', primaryMetric: 'revenue', primaryMetricLabel: 'Closed revenue', sortOrder: 40 },
  { code: 'plumbing', name: 'Plumbing', primaryMetric: 'revenue', primaryMetricLabel: 'Closed revenue', sortOrder: 50 },
  { code: 'electrical', name: 'Electrical', primaryMetric: 'revenue', primaryMetricLabel: 'Closed revenue', sortOrder: 60 },
];

// ─── Technicians (roster) ──────────────────────────────────────────────────

export interface TechSeed {
  id: number;
  name: string;
  dept: string;
  role: string;
  revenue: number;          // $ MTD
  lyRevenue: number;        // $ MTD LY
  closeRate: number;        // %
  lyCloseRate: number;      // %
  jobs: number;
  lyJobs: number;
  avgTicket: number;        // $
  lyAvgTicket: number;      // $
  memberships: number;
  recentSpark: number[];    // last 10-day pattern
}

export const TECHNICIANS: TechSeed[] = [
  // Comfort Advisor (sales-side of HVAC; Plumbing / Electrical where applicable)
  { id: 101, name: 'Marcus Vega',     dept: 'hvac_sales', role: 'comfort_advisor', revenue: 284_500, lyRevenue: 241_200, closeRate: 58.2, lyCloseRate: 54.1, jobs: 42, lyJobs: 38, avgTicket: 6_774, lyAvgTicket: 6_348, memberships: 18, recentSpark: [30, 35, 42, 38, 52, 58, 62, 68, 71, 74] },
  { id: 102, name: 'Jenna Rhodes',    dept: 'hvac_sales', role: 'comfort_advisor', revenue: 261_200, lyRevenue: 218_400, closeRate: 54.1, lyCloseRate: 49.8, jobs: 39, lyJobs: 36, avgTicket: 6_697, lyAvgTicket: 6_067, memberships: 22, recentSpark: [28, 32, 38, 44, 48, 52, 58, 61, 65, 68] },
  { id: 103, name: 'David Okafor',    dept: 'hvac_sales', role: 'comfort_advisor', revenue: 218_900, lyRevenue: 224_100, closeRate: 51.4, lyCloseRate: 52.8, jobs: 36, lyJobs: 38, avgTicket: 6_080, lyAvgTicket: 5_897, memberships: 14, recentSpark: [35, 38, 34, 36, 38, 40, 42, 40, 44, 46] },
  { id: 104, name: 'Priya Nair',      dept: 'plumbing',   role: 'comfort_advisor', revenue: 198_400, lyRevenue: 162_800, closeRate: 49.8, lyCloseRate: 45.2, jobs: 48, lyJobs: 42, avgTicket: 4_133, lyAvgTicket: 3_876, memberships: 11, recentSpark: [22, 24, 28, 30, 32, 36, 38, 41, 44, 48] },
  { id: 105, name: 'Tyrell Booker',   dept: 'hvac_sales', role: 'comfort_advisor', revenue: 184_200, lyRevenue: 198_600, closeRate: 47.2, lyCloseRate: 50.1, jobs: 31, lyJobs: 34, avgTicket: 5_942, lyAvgTicket: 5_841, memberships: 9,  recentSpark: [42, 40, 38, 36, 34, 32, 30, 32, 30, 28] },
  { id: 106, name: 'Sofia Lindqvist', dept: 'electrical', role: 'comfort_advisor', revenue: 162_800, lyRevenue: 128_400, closeRate: 44.6, lyCloseRate: 40.2, jobs: 44, lyJobs: 38, avgTicket: 3_700, lyAvgTicket: 3_379, memberships: 8,  recentSpark: [18, 20, 24, 28, 30, 34, 36, 38, 42, 44] },
  { id: 107, name: 'Kenny Park',      dept: 'plumbing',   role: 'comfort_advisor', revenue: 148_600, lyRevenue: 142_300, closeRate: 42.1, lyCloseRate: 41.8, jobs: 38, lyJobs: 36, avgTicket: 3_910, lyAvgTicket: 3_952, memberships: 6,  recentSpark: [24, 26, 24, 28, 26, 28, 30, 28, 30, 32] },
  { id: 108, name: 'Aisha Martin',    dept: 'hvac_sales', role: 'comfort_advisor', revenue: 142_300, lyRevenue: 108_200, closeRate: 41.5, lyCloseRate: 36.4, jobs: 29, lyJobs: 26, avgTicket: 4_907, lyAvgTicket: 4_162, memberships: 12, recentSpark: [20, 22, 24, 26, 28, 30, 32, 34, 36, 38] },

  // HVAC Tech (service side)
  { id: 201, name: 'Elijah Brooks',    dept: 'hvac_service', role: 'hvac_tech', revenue: 148_200, lyRevenue: 132_100, closeRate: 38.2, lyCloseRate: 35.4, jobs: 78, lyJobs: 72, avgTicket: 1_900, lyAvgTicket: 1_834, memberships: 31, recentSpark: [82, 88, 94, 98, 102, 108, 112, 118, 122, 126] },
  { id: 202, name: 'Chloe Nakamura',   dept: 'hvac_service', role: 'hvac_tech', revenue: 134_800, lyRevenue: 118_600, closeRate: 36.8, lyCloseRate: 33.1, jobs: 74, lyJobs: 70, avgTicket: 1_822, lyAvgTicket: 1_694, memberships: 28, recentSpark: [68, 72, 78, 82, 88, 92, 96, 102, 106, 112] },
  { id: 203, name: 'Rafael Torres',    dept: 'hvac_service', role: 'hvac_tech', revenue: 121_500, lyRevenue: 118_300, closeRate: 34.2, lyCloseRate: 34.8, jobs: 68, lyJobs: 68, avgTicket: 1_786, lyAvgTicket: 1_740, memberships: 22, recentSpark: [72, 74, 72, 76, 78, 76, 80, 78, 82, 80] },
  { id: 204, name: 'Morgan Bailey',    dept: 'hvac_service', role: 'hvac_tech', revenue: 112_400, lyRevenue:  98_200, closeRate: 32.8, lyCloseRate: 29.6, jobs: 64, lyJobs: 58, avgTicket: 1_756, lyAvgTicket: 1_693, memberships: 19, recentSpark: [48, 52, 58, 62, 66, 70, 74, 78, 82, 86] },
  { id: 205, name: 'Santiago Ruiz',    dept: 'hvac_service', role: 'hvac_tech', revenue:  98_700, lyRevenue: 104_800, closeRate: 31.2, lyCloseRate: 33.8, jobs: 56, lyJobs: 60, avgTicket: 1_762, lyAvgTicket: 1_747, memberships: 14, recentSpark: [62, 60, 58, 56, 54, 52, 50, 52, 50, 48] },
  { id: 206, name: 'Olivia Carter',    dept: 'hvac_service', role: 'hvac_tech', revenue:  89_400, lyRevenue:  72_800, closeRate: 29.4, lyCloseRate: 26.2, jobs: 51, lyJobs: 45, avgTicket: 1_753, lyAvgTicket: 1_618, memberships: 11, recentSpark: [32, 36, 40, 44, 48, 52, 56, 60, 64, 68] },

  // HVAC Maintenance (Cool Club tune-ups etc.)
  { id: 301, name: 'Dante Whitaker',   dept: 'hvac_maintenance', role: 'hvac_maintenance', revenue: 42_800, lyRevenue: 38_100, closeRate: 22.4, lyCloseRate: 20.8, jobs: 128, lyJobs: 118, avgTicket: 334, lyAvgTicket: 322, memberships: 42, recentSpark: [18, 20, 24, 26, 28, 30, 32, 34, 36, 38] },
  { id: 302, name: 'Harper Quinn',     dept: 'hvac_maintenance', role: 'hvac_maintenance', revenue: 38_400, lyRevenue: 34_800, closeRate: 20.2, lyCloseRate: 19.6, jobs: 118, lyJobs: 112, avgTicket: 325, lyAvgTicket: 310, memberships: 38, recentSpark: [14, 16, 18, 20, 22, 24, 26, 28, 30, 32] },
  { id: 303, name: 'Malik Osei',       dept: 'hvac_maintenance', role: 'hvac_maintenance', revenue: 35_200, lyRevenue: 36_400, closeRate: 19.8, lyCloseRate: 20.2, jobs: 108, lyJobs: 112, avgTicket: 325, lyAvgTicket: 325, memberships: 32, recentSpark: [28, 26, 28, 28, 28, 28, 28, 28, 28, 28] },
  { id: 304, name: 'Sienna Reyes',     dept: 'hvac_maintenance', role: 'hvac_maintenance', revenue: 32_800, lyRevenue: 29_400, closeRate: 18.6, lyCloseRate: 17.4, jobs: 102, lyJobs:  96, avgTicket: 321, lyAvgTicket: 306, memberships: 30, recentSpark: [12, 14, 16, 18, 20, 22, 24, 26, 28, 30] },
  { id: 305, name: 'Graham Ellis',     dept: 'hvac_maintenance', role: 'hvac_maintenance', revenue: 28_600, lyRevenue: 30_100, closeRate: 17.2, lyCloseRate: 18.4, jobs:  94, lyJobs:  98, avgTicket: 304, lyAvgTicket: 307, memberships: 26, recentSpark: [26, 24, 24, 22, 22, 20, 20, 18, 18, 16] },

  // Commercial HVAC
  { id: 401, name: 'Rhea Chakraborty', dept: 'commercial', role: 'commercial_hvac', revenue: 184_200, lyRevenue: 148_600, closeRate: 46.2, lyCloseRate: 42.1, jobs: 24, lyJobs: 22, avgTicket: 7_675, lyAvgTicket: 6_755, memberships: 4, recentSpark: [18, 22, 26, 30, 34, 38, 42, 46, 50, 54] },
  { id: 402, name: 'Jamal Washington', dept: 'commercial', role: 'commercial_hvac', revenue: 162_400, lyRevenue: 142_800, closeRate: 44.1, lyCloseRate: 41.8, jobs: 22, lyJobs: 20, avgTicket: 7_382, lyAvgTicket: 7_140, memberships: 3, recentSpark: [16, 20, 24, 28, 32, 36, 40, 44, 48, 52] },
  { id: 403, name: 'Natasha Volkov',   dept: 'commercial', role: 'commercial_hvac', revenue: 128_600, lyRevenue: 124_200, closeRate: 42.4, lyCloseRate: 43.1, jobs: 18, lyJobs: 19, avgTicket: 7_144, lyAvgTicket: 6_537, memberships: 2, recentSpark: [28, 30, 32, 30, 34, 32, 36, 34, 38, 36] },

  // Plumbing (distinct from comfort-advisor plumbing)
  { id: 501, name: 'Lucia Moreno',     dept: 'plumbing', role: 'plumbing', revenue: 132_400, lyRevenue: 118_600, closeRate: 39.8, lyCloseRate: 37.2, jobs: 34, lyJobs: 31, avgTicket: 3_894, lyAvgTicket: 3_826, memberships: 5, recentSpark: [18, 20, 24, 28, 30, 34, 36, 38, 40, 42] },
  { id: 502, name: 'Oliver Tran',      dept: 'plumbing', role: 'plumbing', revenue: 108_200, lyRevenue: 114_800, closeRate: 36.4, lyCloseRate: 38.6, jobs: 30, lyJobs: 32, avgTicket: 3_607, lyAvgTicket: 3_588, memberships: 4, recentSpark: [32, 30, 28, 28, 26, 26, 24, 24, 22, 22] },

  // Electrical
  { id: 601, name: 'Idris Bakhtiari',  dept: 'electrical', role: 'electrical', revenue: 118_600, lyRevenue: 98_400, closeRate: 38.2, lyCloseRate: 34.8, jobs: 38, lyJobs: 33, avgTicket: 3_121, lyAvgTicket: 2_982, memberships: 6, recentSpark: [16, 18, 22, 24, 26, 28, 30, 34, 36, 38] },
  { id: 602, name: 'Camille Dubois',   dept: 'electrical', role: 'electrical', revenue:  92_400, lyRevenue: 84_200, closeRate: 34.6, lyCloseRate: 32.4, jobs: 32, lyJobs: 29, avgTicket: 2_887, lyAvgTicket: 2_904, memberships: 4, recentSpark: [14, 16, 18, 20, 22, 24, 26, 28, 30, 32] },
];

// ─── Call center ────────────────────────────────────────────────────────────

export const CALL_AGENTS = [
  { name: 'Rachel K.',  calls: 68, booked: 52, ratePct: 76.5, lyRatePct: 71.2 },
  { name: 'Marcus D.',  calls: 61, booked: 44, ratePct: 72.1, lyRatePct: 68.4 },
  { name: 'Talia P.',   calls: 58, booked: 41, ratePct: 70.7, lyRatePct: 66.2 },
  { name: 'Joaquin R.', calls: 54, booked: 36, ratePct: 66.7, lyRatePct: 64.8 },
  { name: 'Brianna L.', calls: 49, booked: 31, ratePct: 63.3, lyRatePct: 61.4 },
];

export const CALL_HOURLY = [
  { hr: 6,  calls: 4,  booked: 2  },
  { hr: 7,  calls: 12, booked: 8  },
  { hr: 8,  calls: 22, booked: 15 },
  { hr: 9,  calls: 28, booked: 21 },
  { hr: 10, calls: 31, booked: 22 },
  { hr: 11, calls: 29, booked: 20 },
  { hr: 12, calls: 24, booked: 16 },
  { hr: 13, calls: 26, booked: 18 },
  { hr: 14, calls: 18, booked: 12 },
  { hr: 15, calls: 14, booked: 9  },
];

// ─── Memberships ────────────────────────────────────────────────────────────

export const MEMBERSHIP_TIERS = [
  { name: 'Cool Club',      price: 19, colorToken: '--d-hvac',       sortOrder: 10, cur: 5180, ly: 4820, ly2: 4380 },
  { name: 'Cool Club Plus', price: 39, colorToken: '--d-commercial', sortOrder: 20, cur: 2344, ly: 2068, ly2: 1820 },
  { name: 'Total Comfort',  price: 89, colorToken: '--d-electrical', sortOrder: 30, cur:  888, ly:  720, ly2:  742 },
];

/** 12-month total active-count history → last entry = current `active`. */
export const MEMBERSHIP_HISTORY = [7200, 7340, 7480, 7605, 7742, 7860, 7982, 8105, 8210, 8296, 8358, 8412];
export const MEMBERSHIP_LY_HISTORY = [6480, 6602, 6712, 6820, 6925, 7028, 7128, 7218, 7302, 7385, 7468, 7608];

// ─── Business Units (ServiceTitan) ──────────────────────────────────────────

export interface BusinessUnitSeed {
  /** ST's numeric BU id. */
  id: number;
  /** BU name as shown in ST settings. */
  name: string;
  /** Internal department code, or null = drop this BU explicitly. */
  departmentCode: string | null;
}

export const BUSINESS_UNITS: BusinessUnitSeed[] = [
  // ── HVAC Service ────────────────────────────────────────────────────────
  { id: 6534,      name: 'LEX Service',                        departmentCode: 'hvac_service' },
  { id: 6540,      name: 'LYONS Service',                      departmentCode: 'hvac_service' },

  // ── HVAC Sales ──────────────────────────────────────────────────────────
  { id: 7695,      name: 'LEX Install - Equipment',            departmentCode: 'hvac_sales' },
  { id: 8085,      name: 'LEX Sales',                          departmentCode: 'hvac_sales' },
  { id: 8204,      name: 'LEX Install - Ducts & Insulation',   departmentCode: 'hvac_sales' },
  { id: 7698,      name: 'LYONS Sales',                        departmentCode: 'hvac_sales' },
  { id: 7832,      name: 'LYONS Install - Ducts & Insulation', departmentCode: 'hvac_sales' },
  { id: 7949,      name: 'LYONS Install - Equipment',          departmentCode: 'hvac_sales' },

  // ── HVAC Maintenance ────────────────────────────────────────────────────
  { id: 7831,      name: 'LEX Maintenance',                    departmentCode: 'hvac_maintenance' },
  { id: 8087,      name: 'LYONS Maintenance',                  departmentCode: 'hvac_maintenance' },

  // ── Plumbing ────────────────────────────────────────────────────────────
  { id: 124467371, name: 'Plumbing Service',                   departmentCode: 'plumbing' },
  { id: 124468396, name: 'Plumbing Maintenance',               departmentCode: 'plumbing' },
  { id: 124692394, name: 'Plumbing Install',                   departmentCode: 'plumbing' },

  // ── Commercial ──────────────────────────────────────────────────────────
  { id: 124928171, name: 'Commercial Install',                 departmentCode: 'commercial' },
  { id: 124928174, name: 'Commercial Sales',                   departmentCode: 'commercial' },
  { id: 124928938, name: 'Commercial Service',                 departmentCode: 'commercial' },
  { id: 124928941, name: 'Commercial Maintenance',             departmentCode: 'commercial' },

  // ── Electrical ──────────────────────────────────────────────────────────
  { id: 455,       name: 'Electrical Maintenance',             departmentCode: 'electrical' },
  { id: 161649734, name: 'Electrical Service',                 departmentCode: 'electrical' },

  // ── ETX (East Texas) ────────────────────────────────────────────────────
  { id: 154681094, name: 'ETX Install - Ducts & Insulation',   departmentCode: 'etx' },
  { id: 154681497, name: 'ETX Maintenance',                    departmentCode: 'etx' },
  { id: 154684495, name: 'ETX Service',                        departmentCode: 'etx' },
  { id: 154687321, name: 'ETX Install - Equipment',            departmentCode: 'etx' },
  { id: 154691820, name: 'ETX Sales',                          departmentCode: 'etx' },

  // ── Explicitly dropped ──────────────────────────────────────────────────
  { id: 10194265,  name: 'Service Star',                       departmentCode: null },
];
