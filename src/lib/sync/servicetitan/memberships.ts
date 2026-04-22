/**
 * Memberships sync. Pulls active memberships from ST and writes a daily
 * snapshot (row per type for today) into membership_daily. The dashboard's
 * /api/kpi/memberships and Financial KPI strip read from the latest row
 * per tier, so one sync per day keeps the UI fresh.
 *
 * On success, we also purge any `source_report_id='seed'` rows so the
 * fake Cool-Club / Cool-Club-Plus / Total-Comfort tiers stop appearing
 * alongside the real ST type names.
 */
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { membershipDaily } from '@/db/schema';
import { collectResource } from './raw-client';
import {
  startSyncRun,
  finishSyncRunSuccess,
  finishSyncRunError,
  type SyncTrigger,
} from '@/lib/sync/runs';

export const MEMBERSHIPS_SOURCE = 'st_memberships';

export interface MembershipsSyncResult {
  runId: number | null;
  skipped?: 'another_run_active';
  typesLoaded: number;
  membershipsFetched: number;
  tiersWritten: number;
  totalActive: number;
}

interface StMembership {
  id: number;
  status?: string;
  active?: boolean;
  membershipTypeId?: number | null;
}

interface StMembershipType {
  id: number;
  name: string;
  active?: boolean;
}

function isoToday(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

export async function syncMemberships(trigger: SyncTrigger): Promise<MembershipsSyncResult> {
  const today = isoToday();
  const start = await startSyncRun({
    source: MEMBERSHIPS_SOURCE,
    trigger,
    reportId: 'memberships',
    windowStart: today,
    windowEnd: today,
  });
  if (start.status === 'skipped') {
    return {
      runId: null,
      skipped: start.reason,
      typesLoaded: 0,
      membershipsFetched: 0,
      tiersWritten: 0,
      totalActive: 0,
    };
  }
  const runId = start.runId;

  try {
    // 1. Fetch the full membership-type list — we need names, not just IDs.
    const types = await collectResource<StMembershipType>({
      path: '/memberships/v2/tenant/{tenant}/membership-types',
    });
    const typeNameById = new Map<number, string>();
    for (const t of types) {
      if (t.id != null && t.name) typeNameById.set(t.id, t.name);
    }

    // 2. Fetch all currently-active memberships.
    const memberships = await collectResource<StMembership>({
      path: '/memberships/v2/tenant/{tenant}/memberships',
      query: { status: 'Active' },
    });
    // Belt-and-braces: ST's `active` flag matches the status filter 99% of
    // the time but filter again just in case the endpoint returns stale rows.
    const active = memberships.filter((m) => m.active !== false && m.status === 'Active');

    // 3. Aggregate active count per type id.
    const countByType = new Map<number, number>();
    for (const m of active) {
      if (m.membershipTypeId == null) continue;
      countByType.set(m.membershipTypeId, (countByType.get(m.membershipTypeId) ?? 0) + 1);
    }

    // 4. Build rows — one per type with activeEnd = count.
    const rows: (typeof membershipDaily.$inferInsert)[] = [];
    for (const [typeId, count] of countByType) {
      const name = typeNameById.get(typeId) ?? `Type ${typeId}`;
      rows.push({
        membershipName: name,
        reportDate: today,
        activeEnd: count,
        newSales: 0,
        canceled: 0,
        netChange: 0,
        priceCents: 0,
        sourceReportId: MEMBERSHIPS_SOURCE,
      });
    }

    let written = 0;
    if (rows.length > 0) {
      const database = db();

      // Wipe seed rows first so they stop appearing as phantom tiers.
      await database
        .delete(membershipDaily)
        .where(eq(membershipDaily.sourceReportId, 'seed'));

      for (let i = 0; i < rows.length; i += 500) {
        const batch = rows.slice(i, i + 500);
        await database
          .insert(membershipDaily)
          .values(batch)
          .onConflictDoUpdate({
            target: [membershipDaily.membershipName, membershipDaily.reportDate],
            set: {
              activeEnd: sql.raw(`excluded.active_end`),
              sourceReportId: sql.raw(`excluded.source_report_id`),
              syncedAt: new Date(),
            },
          });
        written += batch.length;
      }
    }

    const totalActive = active.length;
    await finishSyncRunSuccess(runId, {
      rowsFetched: memberships.length,
      rowsUpserted: written,
    });

    return {
      runId,
      typesLoaded: types.length,
      membershipsFetched: memberships.length,
      tiersWritten: written,
      totalActive,
    };
  } catch (err) {
    const msg = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
    await finishSyncRunError(runId, msg);
    throw err;
  }
}

// Silence unused imports in narrow code paths.
void and;
