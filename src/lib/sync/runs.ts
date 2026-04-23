import { and, eq, lt } from 'drizzle-orm';
import { db } from '@/db/client';
import { syncRuns } from '@/db/schema';

export type SyncTrigger = 'cron' | 'manual' | 'backfill';

export interface StartSyncRunArgs {
  source: string;
  trigger: SyncTrigger;
  reportId?: string;
  windowStart: string; // YYYY-MM-DD
  windowEnd: string;
}

export type StartSyncRunResult =
  | { status: 'started'; runId: number }
  | { status: 'skipped'; reason: 'another_run_active' };

/**
 * Zombie threshold. Vercel functions can run up to 800s (13.3 min) on Pro.
 * We give a little buffer past that so long-running syncs (estimates with
 * many job lookups, big backfills) aren't falsely reaped while still alive.
 */
const ZOMBIE_THRESHOLD_MS = 15 * 60_000;

export async function startSyncRun(args: StartSyncRunArgs): Promise<StartSyncRunResult> {
  const database = db();

  // 1. Zombie sweep — any 'running' row past the threshold gets marked error.
  await database
    .update(syncRuns)
    .set({
      status: 'error',
      finishedAt: new Date(),
      errorMessage:
        'Presumed killed by Vercel function timeout (no terminal event received within 6 minutes).',
    })
    .where(
      and(
        eq(syncRuns.source, args.source),
        eq(syncRuns.status, 'running'),
        lt(syncRuns.startedAt, new Date(Date.now() - ZOMBIE_THRESHOLD_MS)),
      ),
    );

  // 2. Check for an active (non-zombie) running row for this source.
  const active = await database
    .select({ id: syncRuns.id })
    .from(syncRuns)
    .where(and(eq(syncRuns.source, args.source), eq(syncRuns.status, 'running')))
    .limit(1);
  if (active.length > 0) {
    return { status: 'skipped', reason: 'another_run_active' };
  }

  // 3. Insert new row.
  const [row] = await database
    .insert(syncRuns)
    .values({
      source: args.source,
      trigger: args.trigger,
      reportId: args.reportId,
      windowStart: args.windowStart,
      windowEnd: args.windowEnd,
      status: 'running',
    })
    .returning({ id: syncRuns.id });
  return { status: 'started', runId: row.id };
}

export interface FinishSyncRunArgs {
  rowsFetched?: number;
  rowsUpserted?: number;
}

export async function finishSyncRunSuccess(
  id: number,
  args: FinishSyncRunArgs = {},
): Promise<void> {
  const database = db();
  await database
    .update(syncRuns)
    .set({
      status: 'success',
      finishedAt: new Date(),
      rowsFetched: args.rowsFetched,
      rowsUpserted: args.rowsUpserted,
    })
    .where(eq(syncRuns.id, id));
}

export async function finishSyncRunError(id: number, errorMessage: string): Promise<void> {
  const database = db();
  await database
    .update(syncRuns)
    .set({
      status: 'error',
      finishedAt: new Date(),
      errorMessage: errorMessage.slice(0, 2000),
    })
    .where(eq(syncRuns.id, id));
}
