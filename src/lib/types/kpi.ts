export type Unit = 'cents' | 'bps' | 'count' | 'seconds';

export interface CompareValue {
  value: number;
  prev?: number;
  ly?: number;
  ly2?: number;
  unit: Unit;
}

export interface FinancialDepartment {
  code: string;
  name: string;
  colorToken: string;
  revenue: CompareValue;
  target: number;
  jobs: number;
  opportunities: number;
  spark: number[];
  lySpark?: number[];
  ly2Spark?: number[];
}

export interface FinancialTrendPoint {
  date: string;
  actual: number;
  ly?: number;
  ly2?: number;
  target: number;
}

export interface FinancialResponse {
  total: {
    revenue: CompareValue;
    target: number;
    percentToGoal: number;
  };
  departments: FinancialDepartment[];
  trend: FinancialTrendPoint[];
  kpis: {
    closeRate: CompareValue;
    avgTicket: CompareValue;
    opportunities: CompareValue;
    memberships: CompareValue;
  };
  potential: {
    /** Total averaged unsold pipeline in the last 30 days (hot + warm). */
    total: number;
    /** ≤7 days old — hot pipeline, team should follow up this week. */
    hot: number;
    /** 8–30 days old — warm, still actionable with a callback. */
    warm: number;
    /** Number of distinct jobs (customers) contributing to the pipeline.
     *  Multiple estimates on the same job are averaged into one. */
    jobCount: number;
    byDept: Array<{ code: string; name: string; hot: number; warm: number }>;
  };
  meta: {
    period: string;
    asOf: string;
    from: string;
    to: string;
  };
}

export interface ApiEnvelope<T> {
  data: T;
}

// ─── Technicians ─────────────────────────────────────────────────────────────

export interface Role {
  code: string;
  name: string;
  /** Human label for the primary metric column (e.g. "Closed revenue"). */
  primaryMetric: string;
  /** Which field the server sorted technicians by. */
  sortKey: 'revenue' | 'avgTicket' | 'jobs' | 'closeRate';
}

export interface Technician {
  rank: number;
  employeeId: number;
  name: string;
  departmentCode: string;
  photoUrl: string | null;
  revenue: number;           // cents — TotalSales from the report
  ly?: number;               // cents
  closeRate: number;         // bps
  lyCloseRate?: number;      // bps
  /** Sales opportunities (was previously CompletedJobs). */
  opps: number;
  lyOpps?: number;
  /** Avg sale = TotalSales / ClosedOpportunities, in cents. */
  avgSale: number;
  lyAvgSale?: number;
  /** Options per opportunity, multiplied by 100 (e.g., 370 = 3.7). */
  options: number;
  lyOptions?: number;
  trend: 'up' | 'down' | 'flat';
  spark: number[];
  lySpark?: number[];
}

export interface TeamRollup {
  revenue: CompareValue;
  closeRate: CompareValue;
  avgSale: CompareValue;
  oppsDone: CompareValue;
  options: CompareValue;
}

export interface TechniciansResponse {
  role: Role;
  /** All roles — for sub-tab rendering on the client. */
  roles: Role[];
  team: TeamRollup;
  technicians: Technician[];
  meta: {
    period: string;
    asOf: string;
    from: string;
    to: string;
  };
}

// ─── Call Center ────────────────────────────────────────────────────────────

export interface HourlyCall {
  hr: string;
  calls: number;
  booked: number;
  lyCalls?: number;
  lyBooked?: number;
}

export interface Agent {
  name: string;
  calls: number;
  booked: number;
  rate: number;    // bps
  lyRate?: number; // bps
}

export interface CallCenterResponse {
  kpis: {
    booked: CompareValue;       // count
    bookRate: CompareValue;     // bps
    avgCallTime: CompareValue;  // seconds — duration of an average call
    abandonRate: CompareValue;  // bps
  };
  hourly: HourlyCall[];
  agents: Agent[];
  byDay: Array<{
    date: string;
    total: number;
    booked: number;
    bookRateBps: number;
    avgCallTimeSec: number;
    abandonRateBps: number;
  }>;
  meta: {
    period: string;
    asOf: string;
    from: string;
    to: string;
  };
}

// ─── Memberships ────────────────────────────────────────────────────────────

export interface MembershipSnapshot {
  active: number;
  newMonth: number;
  churnMonth: number;
  netMonth: number;
}

export interface MembershipTier {
  tier: string;
  count: number;
  lyCount?: number;
  price: number;                 // whole dollars
  colorToken: string;            // e.g. '--d-hvac'
}

// ─── Analyze (estimates) ────────────────────────────────────────────────────

export interface SeasonalityPoint {
  month: string; // 'Apr', 'May', ...
  closeRateBps: number;
  avgTicketCents: number;
}

export interface AnalyzeDeptRow {
  code: string;
  name: string;
  opportunities: number;
  closeRateBps: number;
  avgTicketCents: number;
  unsoldCents: number;
}

export interface AnalyzeResponse {
  totals: {
    opportunities: number;
    closeRateBps: number;
    unsoldCents: number;
    avgTicketCents: number;
  };
  tierSelection: Array<{ tier: 'low' | 'mid' | 'high'; count: number; pct: number }>;
  timeToClose: Array<{ bucket: 'same_day' | 'one_to_7' | 'over_7'; count: number; pct: number }>;
  seasonality: SeasonalityPoint[];
  byDept: AnalyzeDeptRow[];
  meta: {
    period: string;
    asOf: string;
    from: string;
    to: string;
  };
}

export interface MembershipsResponse {
  active: number;
  goal: number;
  newMonth: number;
  churnMonth: number;
  netMonth: number;
  newWeek: number;
  ly?: MembershipSnapshot;
  ly2?: MembershipSnapshot;
  history: number[];             // 12-month active counts
  lyHistory?: number[];
  breakdown: MembershipTier[];
  meta: {
    period: string;
    asOf: string;
    from: string;
    to: string;
  };
}
