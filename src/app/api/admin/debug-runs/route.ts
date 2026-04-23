/**
 * Quick sync_runs inspector. Shows the last 20 runs across all sources so
 * we can see what's running, stuck, or recently errored.
 *
 *   GET /api/admin/debug-runs
 *   GET /api/admin/debug-runs?source=st_estimates
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

  const source = req.nextUrl.searchParams.get('source');
  const database = db();
  const q = database
    .select()
    .from(syncRuns)
    .orderBy(desc(syncRuns.startedAt))
    .limit(20);

  const rows = source
    ? await q.where(eq(syncRuns.source, source))
    : await q;

  const now = Date.now();
  const summarized = rows.map((r) => ({
    id: r.id,
    source: r.source,
    trigger: r.trigger,
    status: r.status,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt,
    runMinutes: r.finishedAt
      ? (r.finishedAt.getTime() - r.startedAt.getTime()) / 60_000
      : (now - r.startedAt.getTime()) / 60_000,
    windowStart: r.windowStart,
    windowEnd: r.windowEnd,
    rowsFetched: r.rowsFetched,
    rowsUpserted: r.rowsUpserted,
    errorMessage: r.errorMessage?.slice(0, 300) ?? null,
  }));

  return NextResponse.json({ ok: true, rows: summarized });
}
