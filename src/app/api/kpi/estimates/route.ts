/**
 * /api/kpi/estimates — aggregates estimate_analysis rows for the Analyze view.
 *
 * Important: estimates are stored as individual rows but a single customer
 * opportunity is usually 2-3 rows (good/better/best options) sharing a
 * jobId. Counting the rows directly inflates opportunities and "realistic
 * unsold" by 2-3x. This route collapses to one record per jobId before
 * rolling up so the dashboard reflects unique customer pipelines.
 *
 * Tier selection is derived dynamically by ranking the won option's
 * subtotal against its siblings — the report doesn't surface tier
 * directly. Single-option jobs don't contribute to the tier panel.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { and, asc, gte, lte } from 'drizzle-orm';

import { db } from '@/db/client';
import { departments, estimateAnalysis } from '@/db/schema';
import { resolvePeriod, daysInWindow } from '@/lib/period';
import type { AnalyzeResponse, SeasonalityPoint } from '@/lib/types/kpi';

export const dynamic = 'force-dynamic';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface RawRow {
  id: number;
  jobId: number | null;
  opportunityStatus: 'won' | 'unsold' | 'dismissed' | string;
  subtotalCents: number;
  departmentCode: string | null;
  createdOn: string;
  timeToCloseDays: number | null;
}

interface JobAgg {
  status: 'won' | 'unsold' | 'dismissed';
  /** Won subtotal (cents) when sold; 0 otherwise. */
  wonRevenueCents: number;
  /** AVG of unsold subtotals for this job — the "realistic" pipeline value
   *  per opportunity, not the sum of all options. 0 if won/dismissed. */
  realisticUnsoldCents: number;
  /** Tier the customer picked, only set for won jobs with ≥2 options. */
  tier: 'low' | 'mid' | 'high' | null;
  timeToCloseDays: number | null;
  departmentCode: string | null;
  /** YYYY-MM bucket the opportunity is attributed to (won row's month
   *  if won, else the earliest sibling's createdOn). */
  monthKey: string;
}

/** Decide tier from the won option's price vs all sibling option prices. */
function rankTier(wonCents: number, allCents: number[]): 'low' | 'mid' | 'high' | null {
  if (allCents.length < 2) return null;
  const sorted = [...allCents].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  if (max === min) return null;
  if (wonCents <= min) return 'low';
  if (wonCents >= max) return 'high';
  return 'mid';
}

/**
 * Group every row by job opportunity. Rows with a real jobId share that
 * key; rows without one are treated as their own opportunity.
 */
function buildJobAggs(rows: RawRow[]): JobAgg[] {
  const groups = new Map<string, RawRow[]>();
  for (const r of rows) {
    const key = r.jobId != null ? `j${r.jobId}` : `e${r.id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  const out: JobAgg[] = [];
  for (const siblings of groups.values()) {
    // Status priority: any won → won; else any unsold → unsold; else dismissed.
    const won = siblings.find((s) => s.opportunityStatus === 'won');
    const unsold = siblings.filter((s) => s.opportunityStatus === 'unsold');
    const status: JobAgg['status'] = won ? 'won' : unsold.length > 0 ? 'unsold' : 'dismissed';

    let monthKey: string;
    let dept: string | null;
    let ttc: number | null;
    if (won) {
      monthKey = won.createdOn.slice(0, 7);
      dept = won.departmentCode;
      ttc = won.timeToCloseDays;
    } else {
      // Use the earliest sibling for the opportunity's identity.
      const ordered = [...siblings].sort((a, b) =>
        a.createdOn < b.createdOn ? -1 : 1,
      );
      monthKey = ordered[0].createdOn.slice(0, 7);
      dept = ordered[0].departmentCode;
      ttc = ordered[0].timeToCloseDays;
    }

    let realisticUnsoldCents = 0;
    if (status === 'unsold' && unsold.length > 0) {
      const total = unsold.reduce((s, r) => s + Number(r.subtotalCents), 0);
      realisticUnsoldCents = Math.round(total / unsold.length);
    }

    let tier: JobAgg['tier'] = null;
    if (won) {
      const allOptions = siblings.map((s) => Number(s.subtotalCents));
      tier = rankTier(Number(won.subtotalCents), allOptions);
    }

    out.push({
      status,
      wonRevenueCents: won ? Number(won.subtotalCents) : 0,
      realisticUnsoldCents,
      tier,
      timeToCloseDays: ttc,
      departmentCode: dept,
      monthKey,
    });
  }
  return out;
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
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

  const [rawRows, deptList] = await Promise.all([
    database
      .select({
        id: estimateAnalysis.id,
        jobId: estimateAnalysis.jobId,
        opportunityStatus: estimateAnalysis.opportunityStatus,
        subtotalCents: estimateAnalysis.subtotalCents,
        departmentCode: estimateAnalysis.departmentCode,
        createdOn: estimateAnalysis.createdOn,
        timeToCloseDays: estimateAnalysis.timeToCloseDays,
      })
      .from(estimateAnalysis)
      .where(windowWhere),
    database.select().from(departments).orderBy(asc(departments.sortOrder)),
  ]);

  const jobs = buildJobAggs(rawRows as RawRow[]);
  const totalOpps = jobs.length;
  const wonJobs = jobs.filter((j) => j.status === 'won');
  const unsoldJobs = jobs.filter((j) => j.status === 'unsold');

  const wonRevenue = wonJobs.reduce((s, j) => s + j.wonRevenueCents, 0);
  const realisticUnsold = unsoldJobs.reduce((s, j) => s + j.realisticUnsoldCents, 0);

  const closeRateBps = totalOpps > 0 ? Math.round((wonJobs.length / totalOpps) * 10000) : 0;
  const avgTicketCents = wonJobs.length > 0 ? Math.round(wonRevenue / wonJobs.length) : 0;

  // Tier rollup — only won jobs with ≥2 options contribute.
  const tierCounts: Record<'low' | 'mid' | 'high', number> = { low: 0, mid: 0, high: 0 };
  for (const j of wonJobs) {
    if (j.tier) tierCounts[j.tier]++;
  }
  const tierTotal = tierCounts.low + tierCounts.mid + tierCounts.high;
  const tierSelection = (['low', 'mid', 'high'] as const).map((tier) => ({
    tier,
    count: tierCounts[tier],
    pct: tierTotal === 0 ? 0 : Math.round((tierCounts[tier] / tierTotal) * 100),
  }));

  // Time-to-close rollup — only won jobs (sold-time-to-close is the metric).
  const ttcCounts: Record<'same_day' | 'one_to_7' | 'over_7', number> = {
    same_day: 0,
    one_to_7: 0,
    over_7: 0,
  };
  for (const j of wonJobs) {
    const d = j.timeToCloseDays;
    if (d == null) continue;
    if (d === 0) ttcCounts.same_day++;
    else if (d <= 7) ttcCounts.one_to_7++;
    else ttcCounts.over_7++;
  }
  const ttcTotal = ttcCounts.same_day + ttcCounts.one_to_7 + ttcCounts.over_7;
  const timeToClose = (['same_day', 'one_to_7', 'over_7'] as const).map((bucket) => ({
    bucket,
    count: ttcCounts[bucket],
    pct: ttcTotal === 0 ? 0 : Math.round((ttcCounts[bucket] / ttcTotal) * 100),
  }));

  // Seasonality — group jobs by createdOn YYYY-MM.
  type MonthAgg = { opps: number; won: number; revenue: number };
  const byMonth = new Map<string, MonthAgg>();
  for (const j of jobs) {
    const m = byMonth.get(j.monthKey) ?? { opps: 0, won: 0, revenue: 0 };
    m.opps++;
    if (j.status === 'won') {
      m.won++;
      m.revenue += j.wonRevenueCents;
    }
    byMonth.set(j.monthKey, m);
  }
  const monthKeys = monthKeysBefore(period.cur.to, 12);
  const seasonality: SeasonalityPoint[] = monthKeys.map((key) => {
    const [, mm] = key.split('-').map(Number);
    const m = byMonth.get(key);
    const opps = m?.opps ?? 0;
    const won = m?.won ?? 0;
    const rev = m?.revenue ?? 0;
    return {
      month: MONTH_NAMES[mm - 1] ?? key,
      closeRateBps: opps > 0 ? Math.round((won / opps) * 10000) : 0,
      avgTicketCents: won > 0 ? Math.round(rev / won) : 0,
    };
  });

  // Per-department.
  type DeptAgg = { opps: number; won: number; revenue: number; unsold: number };
  const byDeptMap = new Map<string, DeptAgg>();
  for (const j of jobs) {
    const code = j.departmentCode ?? '';
    const d = byDeptMap.get(code) ?? { opps: 0, won: 0, revenue: 0, unsold: 0 };
    d.opps++;
    if (j.status === 'won') {
      d.won++;
      d.revenue += j.wonRevenueCents;
    } else if (j.status === 'unsold') {
      d.unsold += j.realisticUnsoldCents;
    }
    byDeptMap.set(code, d);
  }
  const byDept = deptList.map((d) => {
    const r = byDeptMap.get(d.code);
    const opps = r?.opps ?? 0;
    const won = r?.won ?? 0;
    const rev = r?.revenue ?? 0;
    const unsoldCents = r?.unsold ?? 0;
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
      unsoldCents: realisticUnsold,
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

void daysInWindow;
