/**
 * /api/kpi/technicians — reads pre-aggregated rows from
 * `technician_period`, populated from ST's role-specific Tech KPI
 * reports. Handles period comparison (LY / LY2) by reading the same
 * role rows for the shifted windows.
 *
 * Sparklines are disabled in this path (the report is period-aggregated,
 * not daily). If we need them back, layer in a daily sync later and
 * fall back to technician_daily for the sparkline data only.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { and, eq, asc } from 'drizzle-orm';

import { db } from '@/db/client';
import { technicianPeriod, technicianRoles, employees } from '@/db/schema';
import { resolvePeriod, type Window } from '@/lib/period';
import type {
  CompareValue,
  Role,
  Technician,
  TechniciansResponse,
} from '@/lib/types/kpi';

export const dynamic = 'force-dynamic';

interface TechAgg {
  employeeId: number;
  employeeName: string;
  departmentCode: string | null;
  revenue: number;          // TotalSales (cents)
  opps: number;             // SalesOpportunity
  closed: number;           // ClosedOpportunities
  avgCloseBps: number;
  avgSaleCents: number;     // TotalSales / ClosedOpportunities
  avgTicketCents: number;   // TotalJobAverage
  options: number;          // OptionsPerOpportunity × 100
  jobs: number;             // CompletedJobs
  members: number;          // MembershipsSold
  flips: number;            // LeadsSet
  flipSalesCents: number;   // TotalLeadSales (cents)
}

/**
 * Map role_code → list of technicians. Pulls exactly matching
 * (role, period_start, period_end) rows. Returns empty if no sync has
 * run for that window yet.
 */
async function techsForWindow(roleCode: string, window: Window): Promise<TechAgg[]> {
  const database = db();
  const rows = await database
    .select()
    .from(technicianPeriod)
    .where(
      and(
        eq(technicianPeriod.roleCode, roleCode),
        eq(technicianPeriod.periodStart, window.from),
        eq(technicianPeriod.periodEnd, window.to),
      ),
    );
  return rows.map((r) => {
    const opps = Number(r.salesOpportunity);
    const closed = Number(r.closedOpportunities);
    const revenue = Number(r.totalSalesCents);
    return {
      employeeId: Number(r.employeeId),
      employeeName: r.employeeName,
      departmentCode: r.technicianBusinessUnit,
      revenue,
      opps,
      closed,
      avgCloseBps: Number(r.closeRateBps ?? 0),
      avgSaleCents: closed > 0 ? Math.round(revenue / closed) : 0,
      avgTicketCents: Number(r.totalJobAverageCents ?? 0),
      options: Number(r.optionsPerOpportunity ?? 0),
      jobs: Number(r.completedJobs),
      members: Number(r.membershipsSold),
      flips: Number(r.leadsSet),
      flipSalesCents: Number(r.totalLeadSalesCents),
    };
  });
}

function sortByRole(agg: TechAgg[], primary: Role['sortKey']): TechAgg[] {
  const key =
    primary === 'avgTicket' ? 'avgSaleCents' :
    primary === 'jobs' ? 'opps' :
    primary === 'closeRate' ? 'avgCloseBps' :
    'revenue';
  return agg.slice().sort((a, b) =>
    ((b as TechAgg)[key as keyof TechAgg] as number) -
    ((a as TechAgg)[key as keyof TechAgg] as number)
  );
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const roleCode = params.get('role') ?? 'comfort_advisor';

  const database = db();
  const roleRows = await database
    .select()
    .from(technicianRoles)
    .orderBy(asc(technicianRoles.sortOrder));
  const roles: Role[] = roleRows.map((r) => ({
    code: r.code,
    name: r.name,
    primaryMetric: r.primaryMetricLabel,
    sortKey: r.primaryMetric as Role['sortKey'],
  }));
  const role = roles.find((r) => r.code === roleCode) ?? roles[0];

  const period = resolvePeriod({
    preset: params.get('preset'),
    from: params.get('from'),
    to: params.get('to'),
  });

  const [cur, ly, ly2] = await Promise.all([
    techsForWindow(role.code, period.cur),
    techsForWindow(role.code, period.ly),
    techsForWindow(role.code, period.ly2),
  ]);

  const sorted = sortByRole(cur, role.sortKey);
  const employeeIds = sorted.map((t) => t.employeeId);
  const lyByEmp = new Map(ly.map((r) => [r.employeeId, r]));

  // Photos from employees dimension, if ever populated.
  const photos = new Map<number, string | null>();
  if (employeeIds.length) {
    const empRows = await database
      .select({ id: employees.id, photoUrl: employees.photoUrl })
      .from(employees);
    for (const e of empRows) photos.set(e.id, e.photoUrl);
  }

  const technicians: Technician[] = sorted.map((t, i) => {
    const lyRow = lyByEmp.get(t.employeeId);
    const lyPrev = lyRow?.revenue ?? 0;
    const trend: Technician['trend'] = !lyRow
      ? 'flat'
      : t.revenue > lyPrev * 1.05
        ? 'up'
        : t.revenue < lyPrev * 0.95
          ? 'down'
          : 'flat';

    return {
      rank: i + 1,
      employeeId: t.employeeId,
      name: t.employeeName,
      departmentCode: t.departmentCode ?? 'hvac',
      photoUrl: photos.get(t.employeeId) ?? null,
      revenue: t.revenue,
      ly: lyRow?.revenue,
      closeRate: t.avgCloseBps,
      lyCloseRate: lyRow?.avgCloseBps,
      opps: t.opps,
      lyOpps: lyRow?.opps,
      avgSale: t.avgSaleCents,
      lyAvgSale: lyRow?.avgSaleCents,
      avgTicket: t.avgTicketCents,
      lyAvgTicket: lyRow?.avgTicketCents,
      options: t.options,
      lyOptions: lyRow?.options,
      jobs: t.jobs,
      lyJobs: lyRow?.jobs,
      members: t.members,
      lyMembers: lyRow?.members,
      flips: t.flips,
      lyFlips: lyRow?.flips,
      flipSales: t.flipSalesCents,
      lyFlipSales: lyRow?.flipSalesCents,
      trend,
      // Sparklines require daily data; reports only give us aggregates.
      // Empty arrays keep the UI happy — the chart just renders flat.
      spark: [],
      lySpark: [],
    };
  });

  const sum = (arr: TechAgg[], pick: (a: TechAgg) => number) =>
    arr.reduce((s, a) => s + pick(a), 0);
  const avg = (arr: TechAgg[], pick: (a: TechAgg) => number) =>
    arr.length === 0 ? 0 : Math.round(arr.reduce((s, a) => s + pick(a), 0) / arr.length);

  // Team-level means use SUM(num)/SUM(denom) so volume is weighted, not
  // mean-of-ratios.
  const teamAvgSale = (rows: TechAgg[]) => {
    const totalRev = sum(rows, (a) => a.revenue);
    const totalClosed = sum(rows, (a) => a.closed);
    return totalClosed > 0 ? Math.round(totalRev / totalClosed) : 0;
  };
  const teamAvgTicket = (rows: TechAgg[]) => {
    const totalRev = sum(rows, (a) => a.revenue);
    const totalJobs = sum(rows, (a) => a.jobs);
    return totalJobs > 0 ? Math.round(totalRev / totalJobs) : 0;
  };

  const team: TechniciansResponse['team'] = {
    revenue: compareValue(
      sum(cur, (a) => a.revenue),
      sum(ly, (a) => a.revenue),
      sum(ly2, (a) => a.revenue),
      'cents',
    ),
    closeRate: compareValue(
      avg(cur, (a) => a.avgCloseBps),
      avg(ly, (a) => a.avgCloseBps),
      avg(ly2, (a) => a.avgCloseBps),
      'bps',
    ),
    avgSale: compareValue(
      teamAvgSale(cur),
      teamAvgSale(ly),
      teamAvgSale(ly2),
      'cents',
    ),
    avgTicket: compareValue(
      teamAvgTicket(cur),
      teamAvgTicket(ly),
      teamAvgTicket(ly2),
      'cents',
    ),
    oppsDone: compareValue(
      sum(cur, (a) => a.opps),
      sum(ly, (a) => a.opps),
      sum(ly2, (a) => a.opps),
      'count',
    ),
    jobsDone: compareValue(
      sum(cur, (a) => a.jobs),
      sum(ly, (a) => a.jobs),
      sum(ly2, (a) => a.jobs),
      'count',
    ),
  };

  const body: TechniciansResponse = {
    role,
    roles,
    team,
    technicians,
    meta: {
      period: period.preset ? period.preset.toUpperCase() : 'Custom',
      asOf: new Date().toISOString(),
      from: period.cur.from,
      to: period.cur.to,
    },
  };

  return NextResponse.json({ data: body });
}

function compareValue(
  value: number,
  ly: number | undefined,
  ly2: number | undefined,
  unit: CompareValue['unit'],
): CompareValue {
  return { value, ly, ly2, unit };
}

// suppress unused — Window kept for future daily-sparkline layering
void (null as Window | null);
