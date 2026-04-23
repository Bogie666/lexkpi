/**
 * Estimates sync — pulls open (status=Open) estimates from ST and writes
 * them to `estimate_analysis` with opportunity_status='unsold'. Drives the
 * "Unsold estimates / Potential revenue" panel on the Financial page.
 *
 * Dept mapping: each estimate references a jobId; we batch-fetch those
 * jobs via /jpm/v2/jobs?ids=... to get the businessUnitId, then resolve
 * dept via the business_units table.
 *
 * MVP scope: we only sync unsold (Open) estimates. Won/dismissed
 * aggregation for the Analyze view is a follow-up — those rows remain
 * whatever the seed wrote. On first real run we purge seed 'unsold'
 * rows so the Financial panel doesn't double-count.
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { businessUnits, estimateAnalysis } from '@/db/schema';
import { collectResource } from './raw-client';
import {
  startSyncRun,
  finishSyncRunSuccess,
  finishSyncRunError,
  type SyncTrigger,
} from '@/lib/sync/runs';

export const ESTIMATES_SOURCE = 'st_estimates';

export interface EstimatesSyncResult {
  runId: number | null;
  skipped?: 'another_run_active';
  estimatesFetched: number;
  jobsLookedUp: number;
  rowsUpserted: number;
  estimatesDropped: number;
  unmappedBusinessUnitIds: number[];
  totalUnsoldCents: number;
}

interface StEstimate {
  id: number;
  jobId?: number | null;
  subtotal?: number | string | null;
  createdOn?: string | null;
}

interface StJob {
  id: number;
  businessUnitId?: number | null;
}

function estimateSubtotalCents(e: StEstimate): number {
  const raw = e.subtotal;
  if (raw === null || raw === undefined) return 0;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

function createdOnDate(e: StEstimate): string {
  if (!e.createdOn) return new Date().toISOString().slice(0, 10);
  return e.createdOn.slice(0, 10);
}

async function loadBuToDeptMap(): Promise<Map<number, string | null>> {
  const database = db();
  const rows = await database
    .select({ id: businessUnits.id, departmentCode: businessUnits.departmentCode })
    .from(businessUnits);
  return new Map(rows.map((r) => [r.id, r.departmentCode]));
}

/**
 * Resolve jobId → businessUnitId by pulling every job modified within the
 * last 3 years in a single paginated sweep. One big read is far cheaper
 * than hundreds of batched `ids=...` calls (each of which costs 500ms of
 * throttle + round-trip). For 100K jobs at 500/page → 200 pages → ~5 min
 * with our rate-limiter, and we only do it once per sync.
 */
async function loadJobBUsByModifiedWindow(): Promise<Map<number, number | null>> {
  const modifiedOnOrAfter = new Date(Date.now() - 3 * 365 * 86_400_000)
    .toISOString();
  const jobs = await collectResource<StJob>({
    path: '/jpm/v2/tenant/{tenant}/jobs',
    query: { modifiedOnOrAfter },
    pageSize: 500,
  });
  const out = new Map<number, number | null>();
  for (const j of jobs) out.set(j.id, j.businessUnitId ?? null);
  return out;
}

async function purgeSeedUnsoldRows(): Promise<number> {
  const database = db();
  const res = await database
    .delete(estimateAnalysis)
    .where(
      and(
        eq(estimateAnalysis.sourceReportId, 'seed'),
        eq(estimateAnalysis.opportunityStatus, 'unsold'),
      ),
    )
    .returning({ id: estimateAnalysis.id });
  return res.length;
}

export async function syncEstimates(
  trigger: SyncTrigger,
): Promise<EstimatesSyncResult> {
  const today = new Date().toISOString().slice(0, 10);
  const start = await startSyncRun({
    source: ESTIMATES_SOURCE,
    trigger,
    reportId: 'estimates',
    windowStart: today,
    windowEnd: today,
  });
  if (start.status === 'skipped') {
    return {
      runId: null,
      skipped: start.reason,
      estimatesFetched: 0,
      jobsLookedUp: 0,
      rowsUpserted: 0,
      estimatesDropped: 0,
      unmappedBusinessUnitIds: [],
      totalUnsoldCents: 0,
    };
  }
  const runId = start.runId;
  const unmapped = new Set<number>();

  try {
    const buToDept = await loadBuToDeptMap();

    // Pull every open estimate. ST may have tens of thousands of these
    // accumulated over years; ~40-80 pages at 500/page is typical.
    const estimates = await collectResource<StEstimate>({
      path: '/sales/v2/tenant/{tenant}/estimates',
      query: { status: 'Open' },
    });

    const fetched = estimates.length;

    // Load a broad jobId → BU map once, instead of 600 batched calls.
    const jobBUs = await loadJobBUsByModifiedWindow();
    const jobIds = Array.from(
      new Set(estimates.map((e) => e.jobId).filter((id): id is number => id != null)),
    );

    // Build upsert rows — skip estimates we can't map to a dept.
    let dropped = 0;
    const rows: Array<typeof estimateAnalysis.$inferInsert> = [];
    for (const e of estimates) {
      if (!e.jobId) {
        dropped++;
        continue;
      }
      const buId = jobBUs.get(e.jobId);
      if (!buId) {
        dropped++;
        continue;
      }
      if (!buToDept.has(buId)) {
        dropped++;
        unmapped.add(buId);
        continue;
      }
      const dept = buToDept.get(buId) ?? null;
      rows.push({
        estimateId: String(e.id),
        opportunityStatus: 'unsold',
        soldOn: null,
        createdOn: createdOnDate(e),
        subtotalCents: estimateSubtotalCents(e),
        departmentCode: dept,
        timeToCloseDays: null,
        tierSelected: null,
        sourceReportId: ESTIMATES_SOURCE,
      });
    }

    // Wipe seeded unsold rows once so we don't double-count the Financial
    // panel. Real won/dismissed seeded rows stay so the Analyze view keeps
    // working until we wire those too.
    await purgeSeedUnsoldRows();

    let upserted = 0;
    if (rows.length > 0) {
      const database = db();
      for (let i = 0; i < rows.length; i += 500) {
        const batch = rows.slice(i, i + 500);
        await database
          .insert(estimateAnalysis)
          .values(batch)
          .onConflictDoUpdate({
            target: estimateAnalysis.estimateId,
            set: {
              opportunityStatus: sql.raw(`excluded.opportunity_status`),
              subtotalCents: sql.raw(`excluded.subtotal_cents`),
              departmentCode: sql.raw(`excluded.department_code`),
              sourceReportId: sql.raw(`excluded.source_report_id`),
              syncedAt: new Date(),
            },
          });
        upserted += batch.length;
      }
    }

    // Any estimates that were 'unsold' last sync but are now won/dismissed
    // won't appear in this fetch. We don't try to reconcile them here —
    // a future 'st_estimates_full' sync will cover won/dismissed and let
    // us flip statuses correctly. For now, the Financial panel slightly
    // overcounts until the row's status changes or it ages out.

    const totalUnsoldCents = rows.reduce((s, r) => s + Number(r.subtotalCents), 0);

    await finishSyncRunSuccess(runId, {
      rowsFetched: fetched,
      rowsUpserted: upserted,
    });

    return {
      runId,
      estimatesFetched: fetched,
      jobsLookedUp: jobIds.length,
      rowsUpserted: upserted,
      estimatesDropped: dropped,
      unmappedBusinessUnitIds: Array.from(unmapped).slice(0, 40),
      totalUnsoldCents,
    };
  } catch (err) {
    const msg = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
    await finishSyncRunError(runId, msg);
    throw err;
  }
}

// silence unused imports in narrow builds
void inArray;
