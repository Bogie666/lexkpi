import { eq } from 'drizzle-orm';
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

export async function startSyncRun(args: StartSyncRunArgs): Promise<number> {
  const database = db();
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
  return row.id;
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

export async function finishSyncRunError(
  id: number,
  errorMessage: string,
): Promise<void> {
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
