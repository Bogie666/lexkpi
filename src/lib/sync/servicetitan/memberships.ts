/**
 * Memberships sync — daily snapshot. Pulls every membership in ST
 * (all statuses) so we can compute not just today's active count per
 * tier but also "new this month" and "canceled this month" — the
 * columns the dashboard uses for growth / churn stats.
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
  totalNewThisMonth: number;
  totalCanceledThisMonth: number;
}

interface StMembership {
  id: number;
  status?: string;
  active?: boolean;
  membershipTypeId?: number | null;
  from?: string | null;
  to?: string | null;
  cancellationDate?: string | null;
}

interface StMembershipType {
  id: number;
  name: string;
  active?: boolean;
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function isoDate(s: string | null | undefined): string | null {
  if (!s) return null;
  const d = s.slice(0, 10);
  if (d.startsWith('0001-')) return null;
  return d;
}

/** Earliest end date (cancellation or expiration). null = still open. */
function effectiveEnd(m: StMembership): string | null {
  const cancel = isoDate(m.cancellationDate);
  const expire = isoDate(m.to);
  if (!cancel && !expire) return null;
  if (!cancel) return expire;
  if (!expire) return cancel;
  return cancel < expire ? cancel : expire;
}

export async function syncMemberships(trigger: SyncTrigger): Promise<MembershipsSyncResult> {
  const today = isoToday();
  const monthKey = today.slice(0, 7); // YYYY-MM
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
      totalNewThisMonth: 0,
      totalCanceledThisMonth: 0,
    };
  }
  const runId = start.runId;

  try {
    // 1. Membership-type list (for names).
    const types = await collectResource<StMembershipType>({
      path: '/memberships/v2/tenant/{tenant}/membership-types',
    });
    const typeNameById = new Map<number, string>();
    for (const t of types) {
      if (t.id != null && t.name) typeNameById.set(t.id, t.name);
    }

    // 2. Pull every membership — any status — so we can count new + canceled
    //    this month per type alongside today's active count.
    const memberships = await collectResource<StMembership>({
      path: '/memberships/v2/tenant/{tenant}/memberships',
      query: {},
    });

    // 3. Aggregate per type.
    type Agg = { active: number; newThisMonth: number; canceledThisMonth: number };
    const perType = new Map<number, Agg>();
    for (const m of memberships) {
      if (m.membershipTypeId == null) continue;
      const from = isoDate(m.from);
      if (!from) continue;
      const endEff = effectiveEnd(m);
      const agg = perType.get(m.membershipTypeId) ?? { active: 0, newThisMonth: 0, canceledThisMonth: 0 };

      // Active right now
      if (from <= today && (!endEff || endEff > today)) agg.active += 1;
      // New this calendar month
      if (from.slice(0, 7) === monthKey) agg.newThisMonth += 1;
      // Canceled / expired this calendar month
      if (endEff && endEff.slice(0, 7) === monthKey) agg.canceledThisMonth += 1;

      perType.set(m.membershipTypeId, agg);
    }

    // 4. Build upsert rows.
    const rows: (typeof membershipDaily.$inferInsert)[] = [];
    let totalActive = 0;
    let totalNew = 0;
    let totalCanceled = 0;
    for (const [typeId, agg] of perType) {
      if (agg.active === 0 && agg.newThisMonth === 0 && agg.canceledThisMonth === 0) continue;
      const name = typeNameById.get(typeId) ?? `Type ${typeId}`;
      rows.push({
        membershipName: name,
        reportDate: today,
        activeEnd: agg.active,
        newSales: agg.newThisMonth,
        canceled: agg.canceledThisMonth,
        netChange: agg.newThisMonth - agg.canceledThisMonth,
        priceCents: 0,
        sourceReportId: MEMBERSHIPS_SOURCE,
      });
      totalActive += agg.active;
      totalNew += agg.newThisMonth;
      totalCanceled += agg.canceledThisMonth;
    }

    let written = 0;
    if (rows.length > 0) {
      const database = db();

      // Wipe seed rows so they stop appearing as phantom tiers.
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
              newSales: sql.raw(`excluded.new_sales`),
              canceled: sql.raw(`excluded.canceled`),
              netChange: sql.raw(`excluded.net_change`),
              sourceReportId: sql.raw(`excluded.source_report_id`),
              syncedAt: new Date(),
            },
          });
        written += batch.length;
      }
    }

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
      totalNewThisMonth: totalNew,
      totalCanceledThisMonth: totalCanceled,
    };
  } catch (err) {
    const msg = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
    await finishSyncRunError(runId, msg);
    throw err;
  }
}

// Silence unused imports in narrow code paths.
void and;
