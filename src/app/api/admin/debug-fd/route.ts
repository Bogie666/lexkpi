/**
 * Temporary diagnostic. Returns a summary of financial_daily: total row
 * count, date range, unique dates, and a histogram by year.
 * Delete this route once we've reconciled the backfill weirdness.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/db/client';

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
  const summaryResult = await database.execute(sql`
    SELECT
      COUNT(*)::int                              AS total_rows,
      COUNT(DISTINCT report_date)::int           AS unique_dates,
      MIN(report_date)::text                     AS earliest,
      MAX(report_date)::text                     AS latest
    FROM financial_daily
  `);
  const byYearResult = await database.execute(sql`
    SELECT
      EXTRACT(YEAR FROM report_date)::int AS year,
      COUNT(*)::int                       AS rows,
      COUNT(DISTINCT report_date)::int    AS dates,
      SUM(total_revenue_cents)::bigint    AS revenue_cents
    FROM financial_daily
    GROUP BY 1
    ORDER BY 1
  `);

  // Neon HTTP's execute result is iterable but not always array-indexable in
  // the type. Normalise to arrays via spread.
  const summaryRows = [...(summaryResult as unknown as Iterable<unknown>)];
  const byYear = [...(byYearResult as unknown as Iterable<unknown>)];

  return NextResponse.json({
    summary: summaryRows[0] ?? null,
    byYear,
  });
}
