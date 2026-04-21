/**
 * /api/kpi/estimates — aggregates estimate_analysis rows for the Analyze view.
 * Returns totals, tier selection distribution, time-to-close buckets,
 * monthly seasonality (close rate + avg ticket), and per-dept breakdown.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { and, gte, lte, sql, asc } from 'drizzle-orm';

import { db } from '@/db/client';
import { departments, estimateAnalysis } from '@/db/schema';
import { resolvePeriod, daysInWindow } from '@/lib/period';
import type { AnalyzeResponse, SeasonalityPoint } from '@/lib/types/kpi';

export const dynamic = 'force-dynamic';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  // Default window = trailing 12 months (matches the mock's "Last 12 Months")
  const period = resolvePeriod({
    preset: params.get('preset') ?? 'ttm',
    from: params.get('from'),
    to: params.get('to'),
  });
  const database = db();

  const windowWhere = and(
    gte(estimateAnalysis.createdOn, period.cur.from),
    lte(estimateAnalysis.createdOn, period.cur.to),
  );

  // Totals + tier/TTC counts + per-dept rollup all from one fetch.
  // Dataset is ~30k rows max, so aggregating with grouped queries is fine.
  const [totals, tierRows, ttcRows, deptRows, seasonalityRows, deptList] = await Promise.all([
    database
      .select({
        totalOpps: sql<number>`COUNT(*)::int`,
        won: sql<number>`COUNT(*) FILTER (WHERE opportunity_status = 'won')::int`,
        unsoldCents: sql<number>`COALESCE(SUM(subtotal_cents) FILTER (WHERE opportunity_status = 'unsold'), 0)::bigint`,
        wonRevenueCents: sql<number>`COALESCE(SUM(subtotal_cents) FILTER (WHERE opportunity_status = 'won'), 0)::bigint`,
      })
      .from(estimateAnalysis)
      .where(windowWhere),

    database
      .select({
        tier: estimateAnalysis.tierSelected,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(estimateAnalysis)
      .where(and(windowWhere, sql`tier_selected IS NOT NULL`))
      .groupBy(estimateAnalysis.tierSelected),

    database
      .select({
        bucket: sql<string>`CASE
          WHEN time_to_close_days = 0 THEN 'same_day'
          WHEN time_to_close_days BETWEEN 1 AND 7 THEN 'one_to_7'
          WHEN time_to_close_days >= 8 THEN 'over_7'
          ELSE 'unknown'
        END`,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(estimateAnalysis)
      .where(and(windowWhere, sql`time_to_close_days IS NOT NULL`))
      .groupBy(sql`1`),

    database
      .select({
        departmentCode: estimateAnalysis.departmentCode,
        opps: sql<number>`COUNT(*)::int`,
        won: sql<number>`COUNT(*) FILTER (WHERE opportunity_status = 'won')::int`,
        wonRevenue: sql<number>`COALESCE(SUM(subtotal_cents) FILTER (WHERE opportunity_status = 'won'), 0)::bigint`,
        unsold: sql<number>`COALESCE(SUM(subtotal_cents) FILTER (WHERE opportunity_status = 'unsold'), 0)::bigint`,
      })
      .from(estimateAnalysis)
      .where(windowWhere)
      .groupBy(estimateAnalysis.departmentCode),

    database
      .select({
        monthKey: sql<string>`TO_CHAR(created_on, 'YYYY-MM')`,
        opps: sql<number>`COUNT(*)::int`,
        won: sql<number>`COUNT(*) FILTER (WHERE opportunity_status = 'won')::int`,
        wonRevenue: sql<number>`COALESCE(SUM(subtotal_cents) FILTER (WHERE opportunity_status = 'won'), 0)::bigint`,
      })
      .from(estimateAnalysis)
      .where(windowWhere)
      .groupBy(sql`1`)
      .orderBy(sql`1`),

    database.select().from(departments).orderBy(asc(departments.sortOrder)),
  ]);

  const t = totals[0] ?? { totalOpps: 0, won: 0, unsoldCents: 0, wonRevenueCents: 0 };
  const totalOpps = Number(t.totalOpps);
  const totalWon = Number(t.won);
  const wonRevenue = Number(t.wonRevenueCents);
  const unsold = Number(t.unsoldCents);

  const closeRateBps = totalOpps > 0 ? Math.round((totalWon / totalOpps) * 10000) : 0;
  const avgTicketCents = totalWon > 0 ? Math.round(wonRevenue / totalWon) : 0;

  // Tier rollup
  const tierTotal = tierRows.reduce((s, r) => s + Number(r.count), 0);
  const tierSelection = (['low', 'mid', 'high'] as const).map((tier) => {
    const match = tierRows.find((r) => r.tier === tier);
    const count = match ? Number(match.count) : 0;
    return { tier, count, pct: tierTotal === 0 ? 0 : Math.round((count / tierTotal) * 100) };
  });

  // Time-to-close rollup
  const ttcTotal = ttcRows.reduce((s, r) => s + Number(r.count), 0);
  const timeToClose = (['same_day', 'one_to_7', 'over_7'] as const).map((bucket) => {
    const match = ttcRows.find((r) => r.bucket === bucket);
    const count = match ? Number(match.count) : 0;
    return { bucket, count, pct: ttcTotal === 0 ? 0 : Math.round((count / ttcTotal) * 100) };
  });

  // Seasonality — always return the 12 months ending at period.cur.to in chronological order
  const monthKeys = monthKeysBefore(period.cur.to, 12);
  const byMonth = new Map(seasonalityRows.map((r) => [r.monthKey, r]));
  const seasonality: SeasonalityPoint[] = monthKeys.map((key) => {
    const [, mm] = key.split('-').map(Number);
    const row = byMonth.get(key);
    const opps = row ? Number(row.opps) : 0;
    const won = row ? Number(row.won) : 0;
    const rev = row ? Number(row.wonRevenue) : 0;
    return {
      month: MONTH_NAMES[mm - 1] ?? key,
      closeRateBps: opps > 0 ? Math.round((won / opps) * 10000) : 0,
      avgTicketCents: won > 0 ? Math.round(rev / won) : 0,
    };
  });

  // Per-department
  const byDeptMap = new Map(deptRows.map((r) => [r.departmentCode ?? '', r]));
  const byDept = deptList.map((d) => {
    const r = byDeptMap.get(d.code);
    const opps = r ? Number(r.opps) : 0;
    const won = r ? Number(r.won) : 0;
    const rev = r ? Number(r.wonRevenue) : 0;
    const unsoldCents = r ? Number(r.unsold) : 0;
    return {
      code: d.code,
      name: d.name,
      opportunities: opps,
      closeRateBps: opps > 0 ? Math.round((won / opps) * 10000) : 0,
      avgTicketCents: won > 0 ? Math.round(rev / won) : 0,
      unsoldCents,
    };
  });

  const body: AnalyzeResponse = {
    totals: {
      opportunities: totalOpps,
      closeRateBps,
      unsoldCents: unsold,
      avgTicketCents,
    },
    tierSelection,
    timeToClose,
    seasonality,
    byDept,
    meta: {
      period: 'TTM',
      asOf: new Date().toISOString(),
      from: period.cur.from,
      to: period.cur.to,
    },
  };

  return NextResponse.json({ data: body });
}

function monthKeysBefore(to: string, n: number): string[] {
  const [y, m] = to.split('-').map(Number);
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}

// silence unused import in narrow builds
void daysInWindow;
