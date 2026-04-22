/**
 * Temporary diagnostic for financial_daily state.
 * Delete once we've confirmed the backfill row counts.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { neon } from '@neondatabase/serverless';

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

  const url =
    process.env.DATABASE_URL_UNPOOLED ??
    process.env.POSTGRES_URL_NON_POOLING ??
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL;
  if (!url) return NextResponse.json({ error: 'no database url' }, { status: 500 });

  const client = neon(url);

  try {
    const summary = await client`
      SELECT COUNT(*)::int AS total_rows,
             COUNT(DISTINCT report_date)::int AS unique_dates,
             MIN(report_date)::text AS earliest,
             MAX(report_date)::text AS latest
      FROM financial_daily
    `;
    const byYear = await client`
      SELECT EXTRACT(YEAR FROM report_date)::int AS year,
             COUNT(*)::int AS rows,
             COUNT(DISTINCT report_date)::int AS dates,
             SUM(total_revenue_cents)::bigint AS revenue_cents
      FROM financial_daily
      GROUP BY 1
      ORDER BY 1
    `;
    const oldestSample = await client`
      SELECT report_date::text, department_code, total_revenue_cents
      FROM financial_daily
      ORDER BY report_date ASC
      LIMIT 5
    `;
    return NextResponse.json({ summary: summary[0] ?? null, byYear, oldestSample });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

// silence unused
void sql;
