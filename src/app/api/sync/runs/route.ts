/**
 * Read-only status endpoint for sync runs. Returns the most recent N runs
 * optionally filtered by source. Handy for peeking at what the last
 * /api/sync/run or cron tick actually did without waiting synchronously.
 *
 *   GET /api/sync/runs?source=st_financial&limit=10
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { syncRuns } from '@/db/schema';

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

  const params = req.nextUrl.searchParams;
  const source = params.get('source');
  const limit = Math.min(Number(params.get('limit') ?? 10), 100);

  const database = db();
  const query = database.select().from(syncRuns);
  const rows = await (source
    ? query.where(eq(syncRuns.source, source))
    : query
  )
    .orderBy(desc(syncRuns.startedAt))
    .limit(limit);

  return NextResponse.json({
    ok: true,
    count: rows.length,
    runs: rows.map((r) => ({
      id: r.id,
      source: r.source,
      trigger: r.trigger,
      reportId: r.reportId,
      window: { from: r.windowStart, to: r.windowEnd },
      status: r.status,
      rowsFetched: r.rowsFetched,
      rowsUpserted: r.rowsUpserted,
      startedAt: r.startedAt,
      finishedAt: r.finishedAt,
      durationSec: r.finishedAt
        ? Math.round((r.finishedAt.getTime() - r.startedAt.getTime()) / 1000)
        : null,
      errorMessage: r.errorMessage?.slice(0, 500) ?? null,
    })),
  });
}
