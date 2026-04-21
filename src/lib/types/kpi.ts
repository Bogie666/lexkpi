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
    total: number;
    byDept: Array<{ code: string; name: string; value: number }>;
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
  revenue: number;           // cents
  ly?: number;               // cents
  closeRate: number;         // bps
  lyCloseRate?: number;      // bps
  jobs: number;
  lyJobs?: number;
  avgTicket: number;         // cents
  lyAvgTicket?: number;      // cents
  memberships: number;
  trend: 'up' | 'down' | 'flat';
  spark: number[];
  lySpark?: number[];
}

export interface TeamRollup {
  revenue: CompareValue;
  closeRate: CompareValue;
  avgTicket: CompareValue;
  jobsDone: CompareValue;
  memberships: CompareValue;
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
    booked: CompareValue;      // count
    bookRate: CompareValue;    // bps
    avgWait: CompareValue;     // seconds
    abandonRate: CompareValue; // bps
  };
  hourly: HourlyCall[];
  agents: Agent[];
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
