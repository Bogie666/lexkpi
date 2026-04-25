/**
 * One-off: distribution of OpportunityStatus + Subtotal in the past 30
 * days of estimate_analysis. Helps debug why the Financial "Potential
 * revenue" number ends up at the value it does.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { sql, gte, and } from 'drizzle-orm';
import { db } from '@/db/client';
import { estimateAnalysis } from '@/db/schema';

export const dynamic = 'force-dynamic';

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const query = req.nextUrl.searchParams.get('secret');
  return bearer === secret || query === secret;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const database = db();

  const thirtyAgo = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);

  const byStatus = await database
    .select({
      opportunityStatus: estimateAnalysis.opportunityStatus,
      opportunityStatusRaw: estimateAnalysis.opportunityStatusRaw,
      count: sql<number>`COUNT(*)::int`,
      sumCents: sql<number>`COALESCE(SUM(${estimateAnalysis.subtotalCents}), 0)::bigint`,
      withJobId: sql<number>`COUNT(${estimateAnalysis.jobId})::int`,
      avgCents: sql<number>`COALESCE(AVG(${estimateAnalysis.subtotalCents}), 0)::bigint`,
      zeroCount: sql<number>`COUNT(*) FILTER (WHERE ${estimateAnalysis.subtotalCents} = 0)::int`,
    })
    .from(estimateAnalysis)
    .where(gte(estimateAnalysis.createdOn, thirtyAgo))
    .groupBy(estimateAnalysis.opportunityStatus, estimateAnalysis.opportunityStatusRaw)
    .orderBy(sql`COUNT(*) DESC`);

  const totals = await database
    .select({
      totalRows: sql<number>`COUNT(*)::int`,
      uniqueJobs: sql<number>`COUNT(DISTINCT ${estimateAnalysis.jobId})::int`,
      jobIdNullRows: sql<number>`COUNT(*) FILTER (WHERE ${estimateAnalysis.jobId} IS NULL)::int`,
    })
    .from(estimateAnalysis)
    .where(
      and(
        gte(estimateAnalysis.createdOn, thirtyAgo),
        sql`${estimateAnalysis.opportunityStatus} = 'unsold'`,
      ),
    );

  return NextResponse.json({
    ok: true,
    windowFrom: thirtyAgo,
    byStatus: byStatus.map((r) => ({
      ...r,
      sumCents: Number(r.sumCents),
      avgCents: Number(r.avgCents),
    })),
    totals: totals[0],
  });
}
