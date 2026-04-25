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
  estimateAnalysis,
  financialDaily,
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

/**
 * KPI strip aggregate — revenue / jobs / opportunities summed from
 * financial_daily (invoices sync writes revenue; jobs sync writes
 * jobs + opps). Replaces the earlier technician_daily-backed read,
 * which was still showing seeded data.
 */
async function financialKpiAggregate(window: Window) {
  const database = db();
  const rows = await database
    .select({
      totalRevenueCents: sql<number>`COALESCE(SUM(${financialDaily.totalRevenueCents}), 0)`,
      totalJobs: sql<number>`COALESCE(SUM(${financialDaily.jobs}), 0)`,
      totalOpps: sql<number>`COALESCE(SUM(${financialDaily.opportunities}), 0)`,
      totalClosedOpps: sql<number>`COALESCE(SUM(${financialDaily.closedOpportunities}), 0)`,
    })
    .from(financialDaily)
    .where(
      and(
        gte(financialDaily.reportDate, window.from),
        lte(financialDaily.reportDate, window.to),
      ),
    );
  return (
    rows[0] ?? { totalRevenueCents: 0, totalJobs: 0, totalOpps: 0, totalClosedOpps: 0 }
  );
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
    financialKpiAggregate(period.cur),
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

  // Per-dept revenue targets whose window overlaps the current window. Sum
  // all overlapping rows per dept — a YTD view hits four monthly targets,
  // and we want the combined goal (not just the last month's).
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
  const targetByDept = new Map<string, number>();
  for (const t of deptTargets) {
    const code = t.scopeValue ?? '';
    targetByDept.set(code, (targetByDept.get(code) ?? 0) + Number(t.targetValue));
  }

  // Company-wide revenue targets (usually none now; team opted for auto-sum).
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
  const companySumFromRows = companyTargets.reduce((s, t) => s + Number(t.targetValue), 0);
  const companyTarget =
    companySumFromRows > 0
      ? companySumFromRows
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

  // Daily target curve. For each day, sum the per-day contribution of every
  // target row whose effective window includes that day. A monthly target
  // contributes targetValue / daysInMonth to each day in that month. If the
  // display window spans multiple monthly targets, their daily contributions
  // stack naturally. If no targets are set for a day, it contributes 0.
  type TargetRow = { effectiveFrom: string; effectiveTo: string; targetValue: unknown };
  const applicableRows: TargetRow[] =
    companyTargets.length > 0 ? companyTargets : deptTargets;
  const rowMeta = applicableRows.map((t) => {
    const days = daysInWindow({ from: t.effectiveFrom, to: t.effectiveTo }).length || 1;
    return {
      from: t.effectiveFrom,
      to: t.effectiveTo,
      perDay: Number(t.targetValue) / days,
    };
  });
  const dailyTarget = (day: string): number => {
    let sum = 0;
    for (const m of rowMeta) {
      if (day >= m.from && day <= m.to) sum += m.perDay;
    }
    return sum;
  };

  let targetCum = 0;
  const trend = trendDays.map((d, i) => {
    targetCum += dailyTarget(d);
    return {
      date: d,
      actual: curCum[i] ?? 0,
      ly: lyCum[i],
      ly2: ly2Cum[i],
      target: Math.round(targetCum),
    };
  });

  const totalCur = curCum[curCum.length - 1] ?? 0;
  const totalLy = lyCum[lyCum.length - 1];
  const totalLy2 = ly2Cum[ly2Cum.length - 1];

  // KPIs — close rate = closed opportunities / total opportunities,
  // avg ticket = revenue / total completed jobs (matches ST report defs).
  const teamRev = Number(teamCur.totalRevenueCents);
  const teamJobs = Number(teamCur.totalJobs);
  const teamOpps = Number(teamCur.totalOpps);
  const teamClosedOpps = Number(teamCur.totalClosedOpps);
  const closeRateBps = teamOpps > 0 ? Math.round((teamClosedOpps / teamOpps) * 10000) : 0;
  const avgTicketCents = teamJobs > 0 ? Math.round(teamRev / teamJobs) : 0;

  // Pull LY equivalents for KPIs
  const teamLy = await financialKpiAggregate(period.ly);
  const teamLy2 = await financialKpiAggregate(period.ly2);
  const lyCloseBps =
    Number(teamLy.totalOpps) > 0
      ? Math.round((Number(teamLy.totalClosedOpps) / Number(teamLy.totalOpps)) * 10000)
      : 0;
  const ly2CloseBps =
    Number(teamLy2.totalOpps) > 0
      ? Math.round((Number(teamLy2.totalClosedOpps) / Number(teamLy2.totalOpps)) * 10000)
      : 0;
  const lyAvgTicket =
    Number(teamLy.totalJobs) > 0
      ? Math.round(Number(teamLy.totalRevenueCents) / Number(teamLy.totalJobs))
      : 0;
  const ly2AvgTicket =
    Number(teamLy2.totalJobs) > 0
      ? Math.round(Number(teamLy2.totalRevenueCents) / Number(teamLy2.totalJobs))
      : 0;

  const memLy = await membershipActiveAsOf(period.ly.to);
  const memLy2 = await membershipActiveAsOf(period.ly2.to);

  // Unsold estimates — actionable pipeline, last 30 days only.
  // Split by age: 'hot' = created ≤ 7 days ago, 'warm' = 8–30 days ago.
  // Older than 30 is dropped — stale estimates rarely convert.
  //
  // ST report 399168856 only emits OpportunityStatus values "Won",
  // "Dismissed", and "Not Attempted" — there's no "Open" / "In Progress"
  // in this tenant's data, so every active estimate looks like "Not
  // Attempted" until a sale or dismissal flips it. We don't filter on
  // raw status; the per-job de-dup below is what cuts the multi-option
  // inflation that previously made the number look crazy.
  const thirtyAgoDate = new Date(Date.now() - 30 * 86_400_000);
  const thirtyAgo = thirtyAgoDate.toISOString().slice(0, 10);
  const sevenAgoDate = new Date(Date.now() - 7 * 86_400_000);
  const unsoldRaw = await database
    .select({
      estimateId: estimateAnalysis.estimateId,
      jobId: estimateAnalysis.jobId,
      createdOn: estimateAnalysis.createdOn,
      subtotalCents: estimateAnalysis.subtotalCents,
      departmentCode: estimateAnalysis.departmentCode,
    })
    .from(estimateAnalysis)
    .where(
      and(
        eq(estimateAnalysis.opportunityStatus, 'unsold'),
        gte(estimateAnalysis.createdOn, thirtyAgo),
      ),
    );

  // Collapse to one row per (job-or-estimate, dept): average subtotal,
  // earliest createdOn for age bucketing.
  const perJob = new Map<string, { dept: string | null; created: string; sum: number; count: number }>();
  for (const r of unsoldRaw) {
    const key = `${r.jobId ?? `est:${r.estimateId}`}|${r.departmentCode ?? ''}`;
    const existing = perJob.get(key);
    if (existing) {
      existing.sum += Number(r.subtotalCents);
      existing.count += 1;
      if (r.createdOn < existing.created) existing.created = r.createdOn;
    } else {
      perJob.set(key, {
        dept: r.departmentCode,
        created: r.createdOn,
        sum: Number(r.subtotalCents),
        count: 1,
      });
    }
  }

  const unsoldByDept = new Map<string, { hot: number; warm: number }>();
  let unsoldHotTotal = 0, unsoldWarmTotal = 0, unsoldJobCount = 0;
  const sevenAgoStr = sevenAgoDate.toISOString().slice(0, 10);
  for (const v of perJob.values()) {
    const avg = Math.round(v.sum / v.count);
    const isHot = v.created > sevenAgoStr;
    unsoldJobCount += 1;
    if (isHot) unsoldHotTotal += avg; else unsoldWarmTotal += avg;
    if (v.dept) {
      const prior = unsoldByDept.get(v.dept) ?? { hot: 0, warm: 0 };
      if (isHot) prior.hot += avg; else prior.warm += avg;
      unsoldByDept.set(v.dept, prior);
    }
  }
  const unsoldTotal = unsoldHotTotal + unsoldWarmTotal;

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
      total: unsoldTotal,
      hot: unsoldHotTotal,
      warm: unsoldWarmTotal,
      jobCount: unsoldJobCount,
      byDept: deptList
        .map((d) => {
          const v = unsoldByDept.get(d.code) ?? { hot: 0, warm: 0 };
          return { code: d.code, name: d.name, hot: v.hot, warm: v.warm };
        })
        .filter((d) => d.hot + d.warm > 0)
        .sort((a, b) => (b.hot + b.warm) - (a.hot + a.warm)),
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
