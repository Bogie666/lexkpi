/**
 * Cron entry point — Vercel Cron hits this every 15 minutes. Checks each
 * source's staleness and kicks off a sync for any that are due.
 *
 * Auth: Vercel Cron sends an `Authorization: Bearer <CRON_SECRET>` header
 * when CRON_SECRET is set in env (see vercel.json). Unauthed callers get 401.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { syncRuns } from '@/db/schema';
import { syncFinancial, FINANCIAL_SOURCE } from '@/lib/sync/servicetitan/financial';
import { syncTechnicianReports, TECHNICIAN_REPORTS_SOURCE } from '@/lib/sync/servicetitan/technician-reports';
import { trailingDays } from '@/lib/sync/window';

function mtdWindow(): { from: string; to: string } {
  const today = new Date();
  const from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
  const to = today.toISOString().slice(0, 10);
  return { from, to };
}

// Silence the unused eq import when we remove the success filter below.
void eq;

export const dynamic = 'force-dynamic';
export const maxDuration = 800;

interface SourceConfig {
  source: string;
  minIntervalMin: number;
  run: () => Promise<unknown>;
}

const SOURCES: SourceConfig[] = [
  {
    source: FINANCIAL_SOURCE,
    minIntervalMin: 30,
    run: () => syncFinancial(trailingDays(7), 'cron'),
  },
  {
    source: TECHNICIAN_REPORTS_SOURCE,
    minIntervalMin: 30, // 2x per hour
    run: () => syncTechnicianReports(mtdWindow(), 'cron'),
  },
  // Additional sources land here as they're ported.
];

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  return bearer === secret;
}

/**
 * Most recent run *of any status* for this source. Using any status (not just
 * success) prevents a cron-retry storm when syncs are failing: if the last
 * error is only 5 minutes old and min_interval is 30, we skip. The sync gets
 * a fresh try once the interval elapses.
 */
async function lastAttemptAt(source: string): Promise<Date | null> {
  const database = db();
  const rows = await database
    .select({ startedAt: syncRuns.startedAt })
    .from(syncRuns)
    .where(and(eq(syncRuns.source, source)))
    .orderBy(desc(syncRuns.startedAt))
    .limit(1);
  return rows[0]?.startedAt ?? null;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const results: Array<{ source: string; skipped?: string; ok?: boolean; error?: string }> = [];

  for (const src of SOURCES) {
    const last = await lastAttemptAt(src.source);
    const staleMin = last ? (Date.now() - last.getTime()) / 60_000 : Infinity;
    if (staleMin < src.minIntervalMin) {
      results.push({ source: src.source, skipped: `recent attempt (${Math.round(staleMin)}m ago)` });
      continue;
    }
    try {
      await src.run();
      results.push({ source: src.source, ok: true });
    } catch (err) {
      results.push({ source: src.source, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), results });
}
