/**
 * /api/kpi/top-performers — top 3 technicians per role for a window.
 * Powers the Engagement → Top Performers tab and the TV rotation's
 * podium scenes. Sources from `technician_period` (the real ST report
 * sync) — not technician_daily, which is still seed data.
 *
 *   GET /api/kpi/top-performers?preset=mtd
 *     → { byRole: [{ role, top: [T, T, T] }, ...], meta }
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { and, asc, eq, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { employees, technicianPeriod, technicianRoles } from '@/db/schema';
import { resolvePeriod } from '@/lib/period';
import type { Role, Technician } from '@/lib/types/kpi';

export const dynamic = 'force-dynamic';

interface RolePodium {
  role: Role;
  top: Technician[];
}

interface TopPerformersResponse {
  byRole: RolePodium[];
  meta: {
    period: string;
    asOf: string;
    from: string;
    to: string;
  };
}

const SORT_KEY: Record<string, 'revenue' | 'avgTicket' | 'jobs' | 'closeRate'> = {
  comfort_advisor: 'revenue',
  hvac_tech: 'revenue',
  hvac_maintenance: 'revenue',
  plumbing: 'revenue',
  electrical: 'revenue',
  commercial_hvac: 'revenue',
};

function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const period = resolvePeriod({
    preset: params.get('preset'),
    from: params.get('from'),
    to: params.get('to'),
  });
  const database = db();

  // Pull the role list (sorted) and every tech_period row in the window.
  const [roles, allRows, empRows] = await Promise.all([
    database
      .select()
      .from(technicianRoles)
      .where(eq(technicianRoles.active, true))
      .orderBy(asc(technicianRoles.sortOrder)),
    database
      .select({
        roleCode: technicianPeriod.roleCode,
        employeeId: technicianPeriod.employeeId,
        employeeName: technicianPeriod.employeeName,
        completedRevenueCents: technicianPeriod.completedRevenueCents,
        closeRateBps: technicianPeriod.closeRateBps,
        salesOpportunity: technicianPeriod.salesOpportunity,
        opportunity: technicianPeriod.opportunity,
        completedJobs: technicianPeriod.completedJobs,
        totalSalesCents: technicianPeriod.totalSalesCents,
        totalJobAverageCents: technicianPeriod.totalJobAverageCents,
        closedOpportunities: technicianPeriod.closedOpportunities,
        membershipsSold: technicianPeriod.membershipsSold,
        leadsSet: technicianPeriod.leadsSet,
        totalLeadSalesCents: technicianPeriod.totalLeadSalesCents,
        optionsPerOpportunity: technicianPeriod.optionsPerOpportunity,
        technicianBusinessUnit: technicianPeriod.technicianBusinessUnit,
      })
      .from(technicianPeriod)
      .where(
        and(
          eq(technicianPeriod.periodStart, period.cur.from),
          eq(technicianPeriod.periodEnd, period.cur.to),
        ),
      ),
    database
      .select({
        normalizedName: employees.normalizedName,
        active: employees.active,
        photoUrl: employees.photoUrl,
      })
      .from(employees),
  ]);

  const photoByNorm = new Map<string, string | null>();
  const activeNorms = new Set<string>();
  for (const e of empRows) {
    photoByNorm.set(e.normalizedName, e.photoUrl);
    if (e.active) activeNorms.add(e.normalizedName);
  }
  const empRoster = empRows.length > 0;

  // Group rows by roleCode.
  const byRoleMap = new Map<string, typeof allRows>();
  for (const r of allRows) {
    const list = byRoleMap.get(r.roleCode) ?? [];
    list.push(r);
    byRoleMap.set(r.roleCode, list);
  }

  const byRole: RolePodium[] = [];
  for (const role of roles) {
    const rows = byRoleMap.get(role.code) ?? [];
    const sortKey = SORT_KEY[role.code] ?? 'revenue';

    // Filter out anyone ST has marked inactive once the employees roster is populated.
    const filtered = rows.filter((r) => {
      if (!empRoster) return true;
      return activeNorms.has(normalize(r.employeeName));
    });

    const sorted = [...filtered].sort((a, b) => {
      if (sortKey === 'revenue')
        return Number(b.completedRevenueCents) - Number(a.completedRevenueCents);
      if (sortKey === 'avgTicket')
        return Number(b.totalJobAverageCents) - Number(a.totalJobAverageCents);
      if (sortKey === 'jobs') return Number(b.completedJobs) - Number(a.completedJobs);
      if (sortKey === 'closeRate')
        return Number(b.closeRateBps ?? 0) - Number(a.closeRateBps ?? 0);
      return 0;
    });

    const top = sorted.slice(0, 3).map((r, i): Technician => {
      const norm = normalize(r.employeeName);
      const isCA = role.code === 'comfort_advisor';
      const opps = isCA ? Number(r.salesOpportunity) : Number(r.opportunity);
      const closed = Number(r.closedOpportunities) || 0;
      const totalSales = Number(r.totalSalesCents) || 0;
      const avgSaleCents = closed > 0 ? Math.round(totalSales / closed) : 0;
      return {
        rank: i + 1,
        employeeId: Number(r.employeeId),
        name: r.employeeName,
        departmentCode: deptCodeForRole(role.code),
        photoUrl: photoByNorm.get(norm) ?? null,
        revenue: Number(r.completedRevenueCents),
        closeRate: Number(r.closeRateBps ?? 0),
        opps,
        avgSale: isCA ? avgSaleCents : Number(r.totalJobAverageCents),
        avgTicket: Number(r.totalJobAverageCents),
        options: Number(r.optionsPerOpportunity ?? 0),
        jobs: Number(r.completedJobs),
        members: Number(r.membershipsSold),
        flips: Number(r.leadsSet),
        flipSales: Number(r.totalLeadSalesCents),
        trend: 'flat',
        spark: [],
      };
    });

    byRole.push({
      role: {
        code: role.code,
        name: role.name,
        primaryMetric: role.primaryMetricLabel,
        sortKey,
      },
      top,
    });
  }

  const body: TopPerformersResponse = {
    byRole,
    meta: {
      period: period.preset ? period.preset.toUpperCase() : 'Custom',
      asOf: new Date().toISOString(),
      from: period.cur.from,
      to: period.cur.to,
    },
  };

  return NextResponse.json({ data: body });
}

/** Map the role code → the dept color we want on the avatar circle. */
function deptCodeForRole(roleCode: string): string {
  switch (roleCode) {
    case 'comfort_advisor':
      return 'hvac_sales';
    case 'hvac_tech':
      return 'hvac_service';
    case 'hvac_maintenance':
      return 'hvac_maintenance';
    case 'plumbing':
      return 'plumbing';
    case 'electrical':
      return 'electrical';
    case 'commercial_hvac':
      return 'commercial';
    default:
      return 'hvac_service';
  }
}

void sql;
