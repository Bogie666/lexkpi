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
