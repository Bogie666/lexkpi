/**
 * ServiceTitan technicians sync. Pulls /settings/v2/{tenant}/technicians
 * and upserts each into our `employees` dimension table by
 * service_titan_id, capturing the `active` flag so the photos admin can
 * filter to current-roster techs without guessing from recent activity.
 *
 * Runs on cron daily — technician-roster turnover is slow.
 */
import { eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { employees } from '@/db/schema';
import { collectResource } from './raw-client';
import {
  startSyncRun,
  finishSyncRunSuccess,
  finishSyncRunError,
  type SyncTrigger,
} from '@/lib/sync/runs';

export const ST_TECHNICIANS_SOURCE = 'st_technicians';

export interface StTechniciansSyncResult {
  runId: number | null;
  skipped?: 'another_run_active';
  fetched: number;
  rowsInserted: number;
  rowsUpdated: number;
  activeCount: number;
  inactiveCount: number;
}

interface StTechnician {
  id: number;
  name?: string | null;
  active?: boolean;
  email?: string | null;
}

function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function syncStTechnicians(
  trigger: SyncTrigger,
): Promise<StTechniciansSyncResult> {
  const today = new Date().toISOString().slice(0, 10);
  const start = await startSyncRun({
    source: ST_TECHNICIANS_SOURCE,
    trigger,
    reportId: 'technicians',
    windowStart: today,
    windowEnd: today,
  });
  if (start.status === 'skipped') {
    return {
      runId: null,
      skipped: start.reason,
      fetched: 0,
      rowsInserted: 0,
      rowsUpdated: 0,
      activeCount: 0,
      inactiveCount: 0,
    };
  }
  const runId = start.runId;

  try {
    const techs = await collectResource<StTechnician>({
      path: '/settings/v2/tenant/{tenant}/technicians',
      query: {},
    });

    const database = db();
    let inserted = 0;
    let updated = 0;
    let active = 0;
    let inactive = 0;

    for (const t of techs) {
      if (t.id == null) continue;
      const name = (t.name ?? '').trim();
      if (!name) continue;
      const norm = normalize(name);
      const isActive = t.active !== false; // default-true if missing

      // Upsert by service_titan_id when present; falls back to
      // normalized_name if a row already exists for this name without
      // an ST id (e.g. seeded data).
      const byStId = await database
        .select({ id: employees.id })
        .from(employees)
        .where(eq(employees.serviceTitanId, t.id))
        .limit(1);

      if (byStId.length > 0) {
        await database
          .update(employees)
          .set({
            name,
            normalizedName: norm,
            active: isActive,
            updatedAt: new Date(),
          })
          .where(eq(employees.id, byStId[0].id));
        updated += 1;
      } else {
        const byName = await database
          .select({ id: employees.id })
          .from(employees)
          .where(eq(employees.normalizedName, norm))
          .limit(1);

        if (byName.length > 0) {
          await database
            .update(employees)
            .set({
              serviceTitanId: t.id,
              name,
              active: isActive,
              updatedAt: new Date(),
            })
            .where(eq(employees.id, byName[0].id));
          updated += 1;
        } else {
          await database.insert(employees).values({
            serviceTitanId: t.id,
            name,
            normalizedName: norm,
            active: isActive,
          });
          inserted += 1;
        }
      }

      if (isActive) active += 1;
      else inactive += 1;
    }

    await finishSyncRunSuccess(runId, {
      rowsFetched: techs.length,
      rowsUpserted: inserted + updated,
    });

    return {
      runId,
      fetched: techs.length,
      rowsInserted: inserted,
      rowsUpdated: updated,
      activeCount: active,
      inactiveCount: inactive,
    };
  } catch (err) {
    const msg = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
    await finishSyncRunError(runId, msg);
    throw err;
  }
}

void sql;
