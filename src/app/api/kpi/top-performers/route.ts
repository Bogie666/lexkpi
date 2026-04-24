/**
 * /api/kpi/top-performers — top N technicians by revenue across ALL roles.
 * Reuses technician_daily. Used by the Engagement → Top Performers panel.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { and, gte, lte, sql, desc } from 'drizzle-orm';

import { db } from '@/db/client';
import { technicianDaily, employees } from '@/db/schema';
import { resolvePeriod } from '@/lib/period';
import type { Technician } from '@/lib/types/kpi';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const limit = Math.min(Number(params.get('limit') ?? 10), 50);
  const period = resolvePeriod({
    preset: params.get('preset'),
    from: params.get('from'),
    to: params.get('to'),
  });
  const database = db();

  const rows = await database
    .select({
      employeeId: technicianDaily.employeeId,
      employeeName: technicianDaily.employeeName,
      roleCode: technicianDaily.roleCode,
      departmentCode: technicianDaily.departmentCode,
      revenue: sql<number>`COALESCE(SUM(${technicianDaily.revenueCents}), 0)::bigint`,
      jobs: sql<number>`COALESCE(SUM(${technicianDaily.jobsCompleted}), 0)::int`,
      avgCloseBps: sql<number>`COALESCE(AVG(${technicianDaily.closeRateBps})::int, 0)`,
      avgTicketCents: sql<number>`COALESCE(AVG(${technicianDaily.avgTicketCents})::bigint, 0)`,
      memberships: sql<number>`COALESCE(SUM(${technicianDaily.memberships}), 0)::int`,
    })
    .from(technicianDaily)
    .where(
      and(
        gte(technicianDaily.reportDate, period.cur.from),
        lte(technicianDaily.reportDate, period.cur.to),
      ),
    )
    .groupBy(
      technicianDaily.employeeId,
      technicianDaily.employeeName,
      technicianDaily.roleCode,
      technicianDaily.departmentCode,
    )
    .orderBy(desc(sql`COALESCE(SUM(${technicianDaily.revenueCents}), 0)`))
    .limit(limit);

  // Pull photos for decoration
  const empRows = await database
    .select({ id: employees.id, photoUrl: employees.photoUrl, roleCode: employees.roleCode })
    .from(employees);
  const photoById = new Map(empRows.map((e) => [e.id, e.photoUrl]));

  // LY comparison — same shape, shifted window
  const lyRows = await database
    .select({
      employeeId: technicianDaily.employeeId,
      revenue: sql<number>`COALESCE(SUM(${technicianDaily.revenueCents}), 0)::bigint`,
    })
    .from(technicianDaily)
    .where(
      and(
        gte(technicianDaily.reportDate, period.ly.from),
        lte(technicianDaily.reportDate, period.ly.to),
      ),
    )
    .groupBy(technicianDaily.employeeId);
  const lyByEmp = new Map(lyRows.map((r) => [r.employeeId, Number(r.revenue)]));

  const performers: Technician[] = rows.map((r, i) => {
    const ly = lyByEmp.get(r.employeeId);
    const trend: Technician['trend'] = !ly
      ? 'flat'
      : Number(r.revenue) > ly * 1.05
        ? 'up'
        : Number(r.revenue) < ly * 0.95
          ? 'down'
          : 'flat';
    return {
      rank: i + 1,
      employeeId: r.employeeId,
      name: r.employeeName,
      departmentCode: r.departmentCode ?? 'hvac',
      photoUrl: photoById.get(r.employeeId) ?? null,
      revenue: Number(r.revenue),
      ly,
      closeRate: Number(r.avgCloseBps),
      // technician_daily uses the older job-centric schema; map best-fit
      // values into the new opps/avgSale/options shape so the Technician
      // type stays consistent with the report-based path.
      opps: Number(r.jobs),
      avgSale: Number(r.avgTicketCents),
      options: 0,
      trend,
      spark: [],
    };
  });

  return NextResponse.json({
    data: {
      performers,
      meta: {
        period: period.preset ? period.preset.toUpperCase() : 'Custom',
        asOf: new Date().toISOString(),
        from: period.cur.from,
        to: period.cur.to,
      },
    },
  });
}
