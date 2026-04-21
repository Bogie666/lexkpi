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
import { trailingDays } from '@/lib/sync/window';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

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
  // Additional sources land here as they're ported.
];

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  return bearer === secret;
}

async function lastSuccessAt(source: string): Promise<Date | null> {
  const database = db();
  const rows = await database
    .select({ finishedAt: syncRuns.finishedAt })
    .from(syncRuns)
    .where(and(eq(syncRuns.source, source), eq(syncRuns.status, 'success')))
    .orderBy(desc(syncRuns.finishedAt))
    .limit(1);
  return rows[0]?.finishedAt ?? null;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const results: Array<{ source: string; skipped?: string; ok?: boolean; error?: string }> = [];

  for (const src of SOURCES) {
    const last = await lastSuccessAt(src.source);
    const staleMin = last ? (Date.now() - last.getTime()) / 60_000 : Infinity;
    if (staleMin < src.minIntervalMin) {
      results.push({ source: src.source, skipped: `fresh (${Math.round(staleMin)}m ago)` });
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
