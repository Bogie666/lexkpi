/**
 * Jobs sync via ServiceTitan /jpm/v2/jobs (raw resource endpoint).
 *
 * Populates `financial_daily.jobs` and `financial_daily.opportunities` —
 * enough to drive the Financial KPI strip's Close Rate, Avg Ticket, and
 * Opportunities numbers without touching the existing revenue column.
 *
 * Upsert key: (department_code, report_date) — same as financial.ts, so
 * jobs & revenue columns land on the same row. Our onConflict SET only
 * touches jobs / opportunities; the existing revenue column is preserved.
 *
 * Simplification vs. ST's report definitions:
 *   - We bucket each job by its `businessUnitId` (the job's primary BU).
 *     ST's "Completed Jobs" metric spreads a job across every BU touched
 *     by its invoice items. Multi-BU jobs are rare; we can refine later
 *     if the delta matters.
 *   - We count opportunity as: status=Completed AND !noCharge AND
 *     !recallForId AND !warrantyId. ST's definition additionally allows
 *     no-charge jobs whose invoice subtotal ≥ a "sold threshold" — we
 *     skip that edge case for MVP.
 */
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { businessUnits, financialDaily } from '@/db/schema';
import { collectResource } from './raw-client';
import {
  startSyncRun,
  finishSyncRunSuccess,
  finishSyncRunError,
  type SyncTrigger,
} from '@/lib/sync/runs';

export const JOBS_SOURCE = 'st_jobs';

export interface SyncWindow {
  from: string; // YYYY-MM-DD, inclusive
  to: string;
}

export interface JobsSyncResult {
  runId: number | null;
  skipped?: 'another_run_active';
  jobsFetched: number;
  rowsUpserted: number;
  jobsDropped: number;
  unmappedBusinessUnitIds: number[];
}

interface StJob {
  id: number;
  jobStatus?: string;
  completedOn?: string | null;
  businessUnitId?: number | null;
  noCharge?: boolean;
  recallForId?: number | null;
  warrantyId?: number | null;
  total?: number | string | null;
}

/**
 * Dollar threshold above which a completed opportunity counts as "closed".
 * ST's report uses a configurable "sold threshold" from tenant settings;
 * we approximate with a low flat value to exclude $0 invoices. Refine
 * later by reading the setting (/settings/v2/...) if the delta matters.
 */
const SOLD_THRESHOLD_CENTS = 100 * 100;

function jobTotalCents(j: StJob): number {
  const raw = j.total;
  if (raw === null || raw === undefined) return 0;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

function dateOf(j: StJob): string | null {
  if (!j.completedOn) return null;
  return j.completedOn.slice(0, 10);
}

function isOpportunity(j: StJob): boolean {
  if (j.noCharge) return false;
  if (j.recallForId != null) return false;
  if (j.warrantyId != null) return false;
  return true;
}

async function loadBuToDeptMap(): Promise<Map<number, string | null>> {
  const database = db();
  const rows = await database
    .select({ id: businessUnits.id, departmentCode: businessUnits.departmentCode })
    .from(businessUnits);
  return new Map(rows.map((r) => [r.id, r.departmentCode]));
}

async function purgeSeedRowsForWindow(window: SyncWindow): Promise<number> {
  const database = db();
  const res = await database
    .delete(financialDaily)
    .where(
      and(
        eq(financialDaily.sourceReportId, 'seed'),
        gte(financialDaily.reportDate, window.from),
        lte(financialDaily.reportDate, window.to),
      ),
    )
    .returning({ id: financialDaily.id });
  return res.length;
}

export async function syncJobs(
  window: SyncWindow,
  trigger: SyncTrigger,
): Promise<JobsSyncResult> {
  const start = await startSyncRun({
    source: JOBS_SOURCE,
    trigger,
    reportId: 'jobs',
    windowStart: window.from,
    windowEnd: window.to,
  });
  if (start.status === 'skipped') {
    return {
      runId: null,
      skipped: start.reason,
      jobsFetched: 0,
      rowsUpserted: 0,
      jobsDropped: 0,
      unmappedBusinessUnitIds: [],
    };
  }
  const runId = start.runId;

  const unmapped = new Set<number>();
  let fetched = 0;
  let dropped = 0;

  try {
    const buToDept = await loadBuToDeptMap();

    // Pull all completed jobs in the window.
    const jobs = await collectResource<StJob>({
      path: '/jpm/v2/tenant/{tenant}/jobs',
      query: {
        completedOnOrAfter: `${window.from}T00:00:00Z`,
        completedOnOrBefore: `${window.to}T23:59:59Z`,
        jobStatus: 'Completed',
      },
    });
    fetched = jobs.length;

    // Aggregate by (dept, completion_date).
    const agg = new Map<
      string,
      { dept: string; date: string; jobs: number; opps: number; closedOpps: number }
    >();
    for (const j of jobs) {
      const date = dateOf(j);
      if (!date) {
        dropped++;
        continue;
      }
      const buId = j.businessUnitId;
      if (!buId) {
        dropped++;
        continue;
      }
      if (!buToDept.has(buId)) {
        dropped++;
        unmapped.add(buId);
        continue;
      }
      const dept = buToDept.get(buId);
      if (!dept) {
        dropped++;
        continue;
      }
      const key = `${dept}|${date}`;
      if (!agg.has(key)) agg.set(key, { dept, date, jobs: 0, opps: 0, closedOpps: 0 });
      const entry = agg.get(key)!;
      entry.jobs += 1;
      if (isOpportunity(j)) {
        entry.opps += 1;
        if (jobTotalCents(j) >= SOLD_THRESHOLD_CENTS) entry.closedOpps += 1;
      }
    }

    const rows = Array.from(agg.values()).map((r) => ({
      departmentCode: r.dept,
      reportDate: r.date,
      totalRevenueCents: 0, // Placeholder — preserved by onConflict if row exists.
      jobs: r.jobs,
      opportunities: r.opps,
      closedOpportunities: r.closedOpps,
      sourceReportId: JOBS_SOURCE,
    }));

    let upserted = 0;
    if (rows.length > 0) {
      const database = db();
      for (let i = 0; i < rows.length; i += 500) {
        const batch = rows.slice(i, i + 500);
        await database
          .insert(financialDaily)
          .values(batch)
          .onConflictDoUpdate({
            target: [financialDaily.departmentCode, financialDaily.reportDate],
            set: {
              // Only job-derived columns come from this sync. Revenue stays
              // whatever the invoices sync wrote there.
              jobs: sql.raw(`excluded.jobs`),
              opportunities: sql.raw(`excluded.opportunities`),
              closedOpportunities: sql.raw(`excluded.closed_opportunities`),
              syncedAt: new Date(),
            },
          });
        upserted += batch.length;
      }
      await purgeSeedRowsForWindow(window);
    }

    await finishSyncRunSuccess(runId, {
      rowsFetched: fetched,
      rowsUpserted: upserted,
    });

    return {
      runId,
      jobsFetched: fetched,
      rowsUpserted: upserted,
      jobsDropped: dropped,
      unmappedBusinessUnitIds: Array.from(unmapped).slice(0, 40),
    };
  } catch (err) {
    const msg = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
    await finishSyncRunError(runId, msg);
    throw err;
  }
}
