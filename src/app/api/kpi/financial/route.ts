/**
 * /api/kpi/financial — real Drizzle queries over financial_daily, targets,
 * technician_daily (for the KPI strip aggregates), and membership_daily.
 * Response shape identical to DATA-SPEC §GET /api/kpi/financial.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { and, eq, gte, lte, sql, desc } from 'drizzle-orm';

import { db } from '@/db/client';
import {
  departments,
  financialDaily,
  technicianDaily,
  membershipDaily,
  targets,
} from '@/db/schema';
import { resolvePeriod, daysInWindow, type Window } from '@/lib/period';
import type { CompareValue, FinancialResponse } from '@/lib/types/kpi';

export const dynamic = 'force-dynamic';

// Build a dept-level revenue + jobs + opps aggregate for a window.
async function financialAggregate(window: Window) {
  const database = db();
  const rows = await database
    .select({
      departmentCode: financialDaily.departmentCode,
      reportDate: financialDaily.reportDate,
      totalRevenueCents: financialDaily.totalRevenueCents,
      jobs: financialDaily.jobs,
      opportunities: financialDaily.opportunities,
    })
    .from(financialDaily)
    .where(
      and(
        gte(financialDaily.reportDate, window.from),
        lte(financialDaily.reportDate, window.to),
      ),
    );
  return rows;
}

async function technicianKpiAggregate(window: Window) {
  const database = db();
  const rows = await database
    .select({
      totalRevenueCents: sql<number>`COALESCE(SUM(${technicianDaily.revenueCents}), 0)`,
      totalJobs: sql<number>`COALESCE(SUM(${technicianDaily.jobsCompleted}), 0)`,
      totalOpps: sql<number>`COALESCE(SUM(${technicianDaily.opportunities}), 0)`,
    })
    .from(technicianDaily)
    .where(
      and(
        gte(technicianDaily.reportDate, window.from),
        lte(technicianDaily.reportDate, window.to),
      ),
    );
  return rows[0] ?? { totalRevenueCents: 0, totalJobs: 0, totalOpps: 0 };
}

// Latest membership_daily row per tier at or before `to`, summed.
async function membershipActiveAsOf(dateStr: string): Promise<number> {
  const database = db();
  const rows = await database
    .select({
      membershipName: membershipDaily.membershipName,
      reportDate: membershipDaily.reportDate,
      activeEnd: membershipDaily.activeEnd,
    })
    .from(membershipDaily)
    .where(lte(membershipDaily.reportDate, dateStr));

  // Pick the latest row per tier in JS — tiny data (≤ a few hundred rows).
  const latest = new Map<string, { date: string; active: number }>();
  for (const r of rows) {
    const prior = latest.get(r.membershipName);
    if (!prior || r.reportDate > prior.date) {
      latest.set(r.membershipName, { date: r.reportDate, active: Number(r.activeEnd) });
    }
  }
  let total = 0;
  for (const v of latest.values()) total += v.active;
  return total;
}

function compareValue(
  value: number,
  ly: number | undefined,
  ly2: number | undefined,
  unit: CompareValue['unit'],
  prev?: number,
): CompareValue {
  return { value, prev, ly, ly2, unit };
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const period = resolvePeriod({
    preset: params.get('preset'),
    from: params.get('from'),
    to: params.get('to'),
  });

  // Fetch current / LY / LY2 dept aggregates in parallel
  const [curRows, lyRows, ly2Rows, teamCur, memActive] = await Promise.all([
    financialAggregate(period.cur),
    financialAggregate(period.ly),
    financialAggregate(period.ly2),
    technicianKpiAggregate(period.cur),
    membershipActiveAsOf(period.cur.to),
  ]);

  const database = db();
  const deptList = await database.select().from(departments).orderBy(departments.sortOrder);

  // Build per-department aggregates + daily spark values
  const curDays = daysInWindow(period.cur);
  const lyDays = daysInWindow(period.ly);

  const sumByDept = (rows: typeof curRows) => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.departmentCode, (m.get(r.departmentCode) ?? 0) + Number(r.totalRevenueCents));
    return m;
  };
  const sparkByDept = (rows: typeof curRows, days: string[]) => {
    const byKey = new Map<string, Map<string, number>>();
    for (const r of rows) {
      if (!byKey.has(r.departmentCode)) byKey.set(r.departmentCode, new Map());
      byKey.get(r.departmentCode)!.set(r.reportDate, Number(r.totalRevenueCents));
    }
    return (code: string) => days.map((d) => byKey.get(code)?.get(d) ?? 0);
  };

  const curByDept = sumByDept(curRows);
  const lyByDept = sumByDept(lyRows);
  const ly2ByDept = sumByDept(ly2Rows);
  const curSpark = sparkByDept(curRows, curDays);
  const lySpark = sparkByDept(lyRows, lyDays);

  // Target per dept, resolving the target whose window covers the current window
  const deptTargets = await database
    .select()
    .from(targets)
    .where(
      and(
        eq(targets.metric, 'revenue'),
        eq(targets.scope, 'department'),
        lte(targets.effectiveFrom, period.cur.to),
        gte(targets.effectiveTo, period.cur.from),
      ),
    );
  const targetByDept = new Map(deptTargets.map((t) => [t.scopeValue ?? '', Number(t.targetValue)]));

  // Company-wide target (fallback to sum of dept targets)
  const companyTargets = await database
    .select()
    .from(targets)
    .where(
      and(
        eq(targets.metric, 'revenue'),
        eq(targets.scope, 'company'),
        lte(targets.effectiveFrom, period.cur.to),
        gte(targets.effectiveTo, period.cur.from),
      ),
    );
  const companyTarget =
    companyTargets.length > 0
      ? Number(companyTargets[0].targetValue)
      : Array.from(targetByDept.values()).reduce((a, b) => a + b, 0);

  // Per-dept jobs/opportunities summed
  const jobsByDept = new Map<string, number>();
  const oppsByDept = new Map<string, number>();
  for (const r of curRows) {
    jobsByDept.set(r.departmentCode, (jobsByDept.get(r.departmentCode) ?? 0) + r.jobs);
    oppsByDept.set(r.departmentCode, (oppsByDept.get(r.departmentCode) ?? 0) + r.opportunities);
  }

  // Trend: cumulative daily totals across all depts
  const dailyCur = new Map<string, number>();
  const dailyLy = new Map<string, number>();
  const dailyLy2 = new Map<string, number>();
  for (const r of curRows) dailyCur.set(r.reportDate, (dailyCur.get(r.reportDate) ?? 0) + Number(r.totalRevenueCents));
  for (const r of lyRows) dailyLy.set(r.reportDate, (dailyLy.get(r.reportDate) ?? 0) + Number(r.totalRevenueCents));
  for (const r of ly2Rows) dailyLy2.set(r.reportDate, (dailyLy2.get(r.reportDate) ?? 0) + Number(r.totalRevenueCents));

  const trendDays = curDays;
  const ly2Days = daysInWindow(period.ly2);

  const cumulative = (map: Map<string, number>, days: string[]) => {
    let running = 0;
    const out: number[] = [];
    for (const d of days) {
      running += map.get(d) ?? 0;
      out.push(running);
    }
    return out;
  };
  const curCum = cumulative(dailyCur, trendDays);
  const lyCum = cumulative(dailyLy, lyDays);
  const ly2Cum = cumulative(dailyLy2, ly2Days);

  // Linear target growth across the window
  const trend = trendDays.map((d, i) => ({
    date: d,
    actual: curCum[i] ?? 0,
    ly: lyCum[i],
    ly2: ly2Cum[i],
    target: Math.round(companyTarget * ((i + 1) / trendDays.length)),
  }));

  const totalCur = curCum[curCum.length - 1] ?? 0;
  const totalLy = lyCum[lyCum.length - 1];
  const totalLy2 = ly2Cum[ly2Cum.length - 1];

  // KPIs
  const teamRev = Number(teamCur.totalRevenueCents);
  const teamJobs = Number(teamCur.totalJobs);
  const teamOpps = Number(teamCur.totalOpps);
  const closeRateBps = teamOpps > 0 ? Math.round((teamJobs / teamOpps) * 10000) : 0;
  const avgTicketCents = teamJobs > 0 ? Math.round(teamRev / teamJobs) : 0;

  // Pull LY equivalents for KPIs
  const teamLy = await technicianKpiAggregate(period.ly);
  const teamLy2 = await technicianKpiAggregate(period.ly2);
  const lyCloseBps =
    Number(teamLy.totalOpps) > 0 ? Math.round((Number(teamLy.totalJobs) / Number(teamLy.totalOpps)) * 10000) : 0;
  const ly2CloseBps =
    Number(teamLy2.totalOpps) > 0 ? Math.round((Number(teamLy2.totalJobs) / Number(teamLy2.totalOpps)) * 10000) : 0;
  const lyAvgTicket =
    Number(teamLy.totalJobs) > 0 ? Math.round(Number(teamLy.totalRevenueCents) / Number(teamLy.totalJobs)) : 0;
  const ly2AvgTicket =
    Number(teamLy2.totalJobs) > 0 ? Math.round(Number(teamLy2.totalRevenueCents) / Number(teamLy2.totalJobs)) : 0;

  const memLy = await membershipActiveAsOf(period.ly.to);
  const memLy2 = await membershipActiveAsOf(period.ly2.to);

  const body: FinancialResponse = {
    total: {
      revenue: compareValue(totalCur, totalLy, totalLy2, 'cents'),
      target: companyTarget,
      percentToGoal: companyTarget > 0 ? Math.round((totalCur / companyTarget) * 10000) : 0,
    },
    departments: deptList.map((d) => ({
      code: d.code,
      name: d.name,
      colorToken: d.colorToken,
      revenue: compareValue(
        curByDept.get(d.code) ?? 0,
        lyByDept.get(d.code),
        ly2ByDept.get(d.code),
        'cents',
      ),
      target: targetByDept.get(d.code) ?? 0,
      jobs: jobsByDept.get(d.code) ?? 0,
      opportunities: oppsByDept.get(d.code) ?? 0,
      spark: curSpark(d.code),
      lySpark: lySpark(d.code),
    })),
    trend,
    kpis: {
      closeRate: compareValue(closeRateBps, lyCloseBps, ly2CloseBps, 'bps'),
      avgTicket: compareValue(avgTicketCents, lyAvgTicket, ly2AvgTicket, 'cents'),
      opportunities: compareValue(teamOpps, Number(teamLy.totalOpps), Number(teamLy2.totalOpps), 'count'),
      memberships: compareValue(memActive, memLy, memLy2, 'count'),
    },
    potential: {
      total: 0,
      byDept: [],
    },
    meta: {
      period: period.preset ? period.preset.toUpperCase() : 'Custom',
      asOf: new Date().toISOString(),
      from: period.cur.from,
      to: period.cur.to,
    },
  };

  return NextResponse.json({ data: body });
}

// Silence unused import in narrow build paths
void desc;
