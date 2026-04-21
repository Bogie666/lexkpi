/**
 * /api/kpi/technicians — aggregates technician_daily over the window per
 * technician, computes team rollups + individual ranks, and returns the
 * response shape the UI already expects.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { and, eq, gte, lte, sql, asc } from 'drizzle-orm';

import { db } from '@/db/client';
import { technicianDaily, technicianRoles, employees } from '@/db/schema';
import { resolvePeriod, daysInWindow, type Window } from '@/lib/period';
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
  revenue: number;
  jobs: number;
  avgCloseBps: number;
  avgTicketCents: number;
  memberships: number;
}

async function aggregateByTech(roleCode: string, window: Window): Promise<TechAgg[]> {
  const database = db();
  const rows = await database
    .select({
      employeeId: technicianDaily.employeeId,
      employeeName: technicianDaily.employeeName,
      departmentCode: technicianDaily.departmentCode,
      revenue: sql<number>`COALESCE(SUM(${technicianDaily.revenueCents}), 0)`,
      jobs: sql<number>`COALESCE(SUM(${technicianDaily.jobsCompleted}), 0)`,
      avgCloseBps: sql<number>`COALESCE(AVG(${technicianDaily.closeRateBps})::int, 0)`,
      avgTicketCents: sql<number>`COALESCE(AVG(${technicianDaily.avgTicketCents})::bigint, 0)`,
      memberships: sql<number>`COALESCE(SUM(${technicianDaily.memberships}), 0)`,
    })
    .from(technicianDaily)
    .where(
      and(
        eq(technicianDaily.roleCode, roleCode),
        gte(technicianDaily.reportDate, window.from),
        lte(technicianDaily.reportDate, window.to),
      ),
    )
    .groupBy(technicianDaily.employeeId, technicianDaily.employeeName, technicianDaily.departmentCode);

  return rows.map((r) => ({
    employeeId: r.employeeId,
    employeeName: r.employeeName,
    departmentCode: r.departmentCode,
    revenue: Number(r.revenue),
    jobs: Number(r.jobs),
    avgCloseBps: Number(r.avgCloseBps),
    avgTicketCents: Number(r.avgTicketCents),
    memberships: Number(r.memberships),
  }));
}

async function sparkByTech(roleCode: string, window: Window, employeeIds: number[]) {
  if (!employeeIds.length) return new Map<number, number[]>();
  const database = db();
  const days = daysInWindow(window);
  const rows = await database
    .select({
      employeeId: technicianDaily.employeeId,
      reportDate: technicianDaily.reportDate,
      revenue: technicianDaily.revenueCents,
    })
    .from(technicianDaily)
    .where(
      and(
        eq(technicianDaily.roleCode, roleCode),
        gte(technicianDaily.reportDate, window.from),
        lte(technicianDaily.reportDate, window.to),
      ),
    );

  const byEmpDay = new Map<number, Map<string, number>>();
  for (const r of rows) {
    if (!byEmpDay.has(r.employeeId)) byEmpDay.set(r.employeeId, new Map());
    byEmpDay.get(r.employeeId)!.set(r.reportDate, Number(r.revenue));
  }
  const out = new Map<number, number[]>();
  for (const id of employeeIds) {
    const dayMap = byEmpDay.get(id) ?? new Map();
    out.set(id, days.map((d) => dayMap.get(d) ?? 0));
  }
  return out;
}

function sortByRole(agg: TechAgg[], primary: Role['sortKey']): TechAgg[] {
  const key =
    primary === 'avgTicket' ? 'avgTicketCents' :
    primary === 'jobs' ? 'jobs' :
    primary === 'closeRate' ? 'avgCloseBps' :
    'revenue';
  return agg.slice().sort((a, b) => (b as TechAgg)[key as keyof TechAgg] as number - ((a as TechAgg)[key as keyof TechAgg] as number));
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const roleCode = params.get('role') ?? 'comfort_advisor';

  const database = db();
  const roleRows = await database.select().from(technicianRoles).orderBy(asc(technicianRoles.sortOrder));
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
    aggregateByTech(role.code, period.cur),
    aggregateByTech(role.code, period.ly),
    aggregateByTech(role.code, period.ly2),
  ]);

  const sorted = sortByRole(cur, role.sortKey);
  const employeeIds = sorted.map((t) => t.employeeId);
  const curSparks = await sparkByTech(role.code, period.cur, employeeIds);
  const lySparks = await sparkByTech(role.code, period.ly, employeeIds);

  const lyByEmp = new Map(ly.map((r) => [r.employeeId, r]));

  // Employee photo URLs (if set) via JOIN-less lookup
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
      jobs: t.jobs,
      lyJobs: lyRow?.jobs,
      avgTicket: t.avgTicketCents,
      lyAvgTicket: lyRow?.avgTicketCents,
      memberships: t.memberships,
      trend,
      spark: curSparks.get(t.employeeId) ?? [],
      lySpark: lySparks.get(t.employeeId),
    };
  });

  // Team rollup
  const sum = (arr: TechAgg[], pick: (a: TechAgg) => number) => arr.reduce((s, a) => s + pick(a), 0);
  const avg = (arr: TechAgg[], pick: (a: TechAgg) => number) =>
    arr.length === 0 ? 0 : Math.round(arr.reduce((s, a) => s + pick(a), 0) / arr.length);

  const team: TechniciansResponse['team'] = {
    revenue: compareValue(sum(cur, (a) => a.revenue), sum(ly, (a) => a.revenue), sum(ly2, (a) => a.revenue), 'cents'),
    closeRate: compareValue(avg(cur, (a) => a.avgCloseBps), avg(ly, (a) => a.avgCloseBps), avg(ly2, (a) => a.avgCloseBps), 'bps'),
    avgTicket: compareValue(avg(cur, (a) => a.avgTicketCents), avg(ly, (a) => a.avgTicketCents), avg(ly2, (a) => a.avgTicketCents), 'cents'),
    jobsDone: compareValue(sum(cur, (a) => a.jobs), sum(ly, (a) => a.jobs), sum(ly2, (a) => a.jobs), 'count'),
    memberships: compareValue(sum(cur, (a) => a.memberships), sum(ly, (a) => a.memberships), sum(ly2, (a) => a.memberships), 'count'),
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
