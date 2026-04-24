/**
 * Memberships backfill — reconstructs monthly snapshots of active
 * members, new sales, and cancellations from every membership in ST
 * (all statuses). Writes one row per (type, month-end) to
 * membership_daily, enabling true growth/loss charts over time.
 *
 * Model:
 *   effectiveEnd(m) = earliest of cancellationDate | to (both optional)
 *   isActiveOn(m, date) = from <= date AND (effectiveEnd IS NULL OR
 *                                            effectiveEnd > date)
 *   monthlyNew(m, month) = from.month == month
 *   monthlyCanceled(m, month) = effectiveEnd.month == month
 *
 * Writes reportDate = last day of each month for dashboards that
 * bucket history by month (they sum activeEnd per YYYY-MM key).
 */
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { membershipDaily } from '@/db/schema';
import { collectResource } from './raw-client';
import {
  startSyncRun,
  finishSyncRunSuccess,
  finishSyncRunError,
  type SyncTrigger,
} from '@/lib/sync/runs';

export const MEMBERSHIPS_BACKFILL_SOURCE = 'st_memberships_backfill';

export interface SyncWindow {
  from: string; // first day of earliest month to write (YYYY-MM-DD)
  to: string; // last day of latest month to write
}

export interface MembershipsBackfillResult {
  runId: number | null;
  skipped?: 'another_run_active';
  totalMembershipsFetched: number;
  typesLoaded: number;
  monthsWritten: number;
  rowsUpserted: number;
}

interface StMembership {
  id: number;
  status?: string;
  membershipTypeId?: number | null;
  from?: string | null;
  to?: string | null;
  cancellationDate?: string | null;
}

interface StMembershipType {
  id: number;
  name: string;
}

function isoDate(s: string | null | undefined): string | null {
  if (!s) return null;
  const d = s.slice(0, 10);
  // ST sometimes emits "0001-01-01" as a null sentinel. Treat as null.
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

/** Iterate [from, to] inclusive, month by month. Yields last-day-of-month strings. */
function* monthEnds(fromISO: string, toISO: string): Generator<{ monthKey: string; endDate: string }> {
  const [fyStr, fmStr] = fromISO.split('-');
  const [tyStr, tmStr] = toISO.split('-');
  let y = Number(fyStr);
  let m = Number(fmStr);
  const endY = Number(tyStr);
  const endM = Number(tmStr);
  while (y < endY || (y === endY && m <= endM)) {
    // Last day of this month
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const endDate = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    const monthKey = `${y}-${String(m).padStart(2, '0')}`;
    yield { monthKey, endDate };
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
}

export async function syncMembershipsBackfill(
  window: SyncWindow,
  trigger: SyncTrigger,
): Promise<MembershipsBackfillResult> {
  const start = await startSyncRun({
    source: MEMBERSHIPS_BACKFILL_SOURCE,
    trigger,
    reportId: 'memberships-backfill',
    windowStart: window.from,
    windowEnd: window.to,
  });
  if (start.status === 'skipped') {
    return {
      runId: null,
      skipped: start.reason,
      totalMembershipsFetched: 0,
      typesLoaded: 0,
      monthsWritten: 0,
      rowsUpserted: 0,
    };
  }
  const runId = start.runId;

  try {
    // 1. All memberships across every status.
    const memberships = await collectResource<StMembership>({
      path: '/memberships/v2/tenant/{tenant}/memberships',
      query: {},
    });

    // 2. Membership types → names.
    const types = await collectResource<StMembershipType>({
      path: '/memberships/v2/tenant/{tenant}/membership-types',
    });
    const typeName = new Map<number, string>();
    for (const t of types) {
      if (t.id != null && t.name) typeName.set(t.id, t.name);
    }

    // 3. For each month, per-type aggregates.
    type Agg = { activeEnd: number; newSales: number; canceled: number };
    const rows: (typeof membershipDaily.$inferInsert)[] = [];
    let monthsWritten = 0;

    for (const { monthKey, endDate } of monthEnds(window.from, window.to)) {
      const perType = new Map<number, Agg>();
      for (const m of memberships) {
        if (m.membershipTypeId == null) continue;
        const from = isoDate(m.from);
        if (!from) continue;
        const endEff = effectiveEnd(m);
        const agg = perType.get(m.membershipTypeId) ?? { activeEnd: 0, newSales: 0, canceled: 0 };

        // Active at end of month: from <= endDate AND (no end OR end > endDate)
        if (from <= endDate && (!endEff || endEff > endDate)) {
          agg.activeEnd += 1;
        }
        // New this month: from.slice(0,7) == monthKey
        if (from.slice(0, 7) === monthKey) agg.newSales += 1;
        // Canceled/expired this month
        if (endEff && endEff.slice(0, 7) === monthKey) agg.canceled += 1;

        perType.set(m.membershipTypeId, agg);
      }

      for (const [typeId, agg] of perType) {
        if (agg.activeEnd === 0 && agg.newSales === 0 && agg.canceled === 0) continue;
        rows.push({
          membershipName: typeName.get(typeId) ?? `Type ${typeId}`,
          reportDate: endDate,
          activeEnd: agg.activeEnd,
          newSales: agg.newSales,
          canceled: agg.canceled,
          netChange: agg.newSales - agg.canceled,
          priceCents: 0,
          sourceReportId: MEMBERSHIPS_BACKFILL_SOURCE,
        });
      }
      monthsWritten++;
    }

    // 4. Purge existing backfill rows in window so stale data from prior
    //    runs doesn't linger.
    const database = db();
    await database
      .delete(membershipDaily)
      .where(
        and(
          eq(membershipDaily.sourceReportId, MEMBERSHIPS_BACKFILL_SOURCE),
          gte(membershipDaily.reportDate, window.from),
          lte(membershipDaily.reportDate, window.to),
        ),
      );

    let upserted = 0;
    if (rows.length > 0) {
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
        upserted += batch.length;
      }
    }

    await finishSyncRunSuccess(runId, {
      rowsFetched: memberships.length,
      rowsUpserted: upserted,
    });

    return {
      runId,
      totalMembershipsFetched: memberships.length,
      typesLoaded: types.length,
      monthsWritten,
      rowsUpserted: upserted,
    };
  } catch (err) {
    const msg = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
    await finishSyncRunError(runId, msg);
    throw err;
  }
}
