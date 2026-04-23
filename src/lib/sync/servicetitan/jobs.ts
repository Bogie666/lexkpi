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
 *
 * Opportunity / Closed-Opp logic follows ST's written rule:
 *   - Opportunity: completed job AND NOT effectively-no-charge, OR
 *     no-charge with a sold estimate whose subtotal ≥ the jobType's
 *     soldThreshold.
 *   - Closed: a completed job with a sold estimate whose subtotal ≥
 *     the jobType's soldThreshold.
 *
 * "Effectively no-charge" = job.noCharge === true OR
 * jobType.noCharge === true. Sold-estimate subtotals come from the
 * Estimates endpoint with a 180-day lookback so long-lead installs
 * aren't missed.
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
  // Window-wide roll-ups so we can compare directly to ST's report without
  // having to query the dashboard API after each sync.
  totals?: {
    jobs: number;
    opportunities: number;
    closedOpportunities: number;
    closeRatePct: number; // rounded to 2dp
    soldEstimatesMatched: number; // jobs in window with a sold-estimate lookup hit
    recallFlagged: number; // jobs in window with recallForId != null (diagnostic)
    warrantyFlagged: number; // jobs in window with warrantyId != null (diagnostic)
    createdFromEstimateFlagged: number; // jobs in window with createdFromEstimateId != null (diagnostic)
    // Per-jobType breakdown of opps. Sorted by descending opp count so the
    // biggest contributors to overcounting surface first. Useful for
    // reconciling against ST's report.
    oppsByType?: Array<{
      typeId: number;
      name: string;
      jobs: number;
      opps: number;
      closed: number;
    }>;
  };
}

interface StJob {
  id: number;
  jobStatus?: string;
  completedOn?: string | null;
  businessUnitId?: number | null;
  jobTypeId?: number | null;
  noCharge?: boolean;
  recallForId?: number | null;
  warrantyId?: number | null;
  createdFromEstimateId?: number | null;
}

interface StJobType {
  id: number;
  name?: string | null;
  soldThreshold?: number | null;
  noCharge?: boolean;
}

interface StEstimate {
  id: number;
  jobId?: number | null;
  subtotal?: number | string | null;
}

interface JobTypeSettings {
  thresholdCents: number;
  noCharge: boolean;
  name: string;
}

/**
 * How far back to look for sold estimates when computing closed-opp gating.
 * Most estimates are sold within ~30 days of job completion, but
 * long-lead installs can span months. 180 days is comfortably safe.
 */
const ESTIMATE_LOOKBACK_DAYS = 180;

function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function estimateSubtotalCents(e: StEstimate): number {
  const raw = e.subtotal;
  if (raw === null || raw === undefined) return 0;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

/**
 * Pull every sold estimate in a window around the jobs window, then build
 * a map of jobId → max sold-estimate subtotal (cents). Jobs missing from
 * the map have never had a sold estimate above the lookback window.
 *
 * We rely on the server-side status=Sold filter; no client-side
 * re-check on the status field because ST returns it as a typed
 * object in some API versions and a string in others.
 */
async function loadSoldEstimateSubtotals(
  window: SyncWindow,
): Promise<Map<number, number>> {
  const soldAfter = `${shiftDate(window.from, -ESTIMATE_LOOKBACK_DAYS)}T00:00:00Z`;
  const soldBefore = `${window.to}T23:59:59Z`;
  const estimates = await collectResource<StEstimate>({
    path: '/sales/v2/tenant/{tenant}/estimates',
    query: {
      status: 'Sold',
      soldAfter,
      soldBefore,
    },
  });
  const map = new Map<number, number>();
  for (const e of estimates) {
    if (!e.jobId) continue;
    const cents = estimateSubtotalCents(e);
    const prior = map.get(e.jobId) ?? 0;
    if (cents > prior) map.set(e.jobId, cents);
  }
  return map;
}

/**
 * Fallback settings for jobs whose jobTypeId isn't in the types map —
 * e.g. archived types. Threshold set low so we don't silently drop real
 * opps; noCharge defaults to false.
 */
const FALLBACK_SETTINGS: JobTypeSettings = {
  thresholdCents: 1 * 100,
  noCharge: false,
  name: '(unknown)',
};

function dateOf(j: StJob): string | null {
  if (!j.completedOn) return null;
  return j.completedOn.slice(0, 10);
}

function jobTypeSettings(j: StJob, map: Map<number, JobTypeSettings>): JobTypeSettings {
  if (!j.jobTypeId) return FALLBACK_SETTINGS;
  return map.get(j.jobTypeId) ?? FALLBACK_SETTINGS;
}

function soldSubtotalForJob(j: StJob, soldByJob: Map<number, number>): number {
  return soldByJob.get(j.id) ?? 0;
}

/**
 * Matches ST's "Sales Opportunity" column (not "Opportunity"). The former
 * additionally excludes recall and warranty jobs. Empirical check from the
 * Ryan New Revenue report for 2026-04-01..22:
 *   Opportunity 1022, SalesOpportunity 958, RecallJobs 26, WarrantyJobs 41
 *   → 1022 - 26 - 41 = 955 ≈ 958 (small rounding within ST).
 *
 * Rule:
 *   - jobType.noCharge === true → always excluded (fulfillment / follow-up)
 *   - recallForId !== null       → always excluded (recall, not a new opp)
 *   - warrantyId !== null        → always excluded (warranty, not a new opp)
 *   - job.noCharge === true, but jobType is charge-eligible → excluded
 *     unless a sold estimate subtotal ≥ threshold exists
 *   - Otherwise → counts as a sales opportunity
 */
function isOpportunity(
  j: StJob,
  typeMap: Map<number, JobTypeSettings>,
  soldByJob: Map<number, number>,
): boolean {
  if (j.recallForId != null) return false;
  if (j.warrantyId != null) return false;
  if (j.createdFromEstimateId != null) return false;
  const s = jobTypeSettings(j, typeMap);
  if (s.noCharge) return false;
  if (!j.noCharge) return true;
  return soldSubtotalForJob(j, soldByJob) >= s.thresholdCents;
}

/**
 * Closed Opportunity: must be a counted opportunity AND have a sold
 * estimate subtotal ≥ the job type's soldThreshold. Never fires for
 * fulfillment, recall, or warranty jobs — they aren't opportunities
 * to begin with.
 */
function isClosedOpportunity(
  j: StJob,
  typeMap: Map<number, JobTypeSettings>,
  soldByJob: Map<number, number>,
): boolean {
  if (j.recallForId != null) return false;
  if (j.createdFromEstimateId != null) return false;
  if (j.warrantyId != null) return false;
  const s = jobTypeSettings(j, typeMap);
  if (s.noCharge) return false;
  return soldSubtotalForJob(j, soldByJob) >= s.thresholdCents;
}

async function loadJobTypeSettings(): Promise<Map<number, JobTypeSettings>> {
  const types = await collectResource<StJobType>({
    path: '/jpm/v2/tenant/{tenant}/job-types',
    query: {},
  });
  const m = new Map<number, JobTypeSettings>();
  for (const t of types) {
    const dollars = t.soldThreshold;
    const threshold =
      typeof dollars === 'number' && Number.isFinite(dollars)
        ? Math.round(dollars * 100)
        : FALLBACK_SETTINGS.thresholdCents;
    m.set(t.id, {
      thresholdCents: threshold,
      noCharge: Boolean(t.noCharge),
      name: t.name ?? `type#${t.id}`,
    });
  }
  return m;
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
    const [buToDept, jobTypeMap, soldByJob] = await Promise.all([
      loadBuToDeptMap(),
      loadJobTypeSettings(),
      loadSoldEstimateSubtotals(window),
    ]);

    // Pull all completed jobs in the window.
    const jobs = await collectResource<StJob>({
      path: '/jpm/v2/tenant/{tenant}/jobs',
      query: {
        // NB: ST's /jpm/v2/jobs accepts `completedOnOrAfter` but silently
        // ignores `completedOnOrBefore`. The upper bound is `completedBefore`
        // (exclusive). We pass the day AFTER window.to so the upper bound
        // stays inclusive at the caller's expectation.
        completedOnOrAfter: `${window.from}T00:00:00Z`,
        completedBefore: `${shiftDate(window.to, 1)}T00:00:00Z`,
        jobStatus: 'Completed',
      },
    });
    fetched = jobs.length;

    // Aggregate by (dept, completion_date).
    const agg = new Map<
      string,
      { dept: string; date: string; jobs: number; opps: number; closedOpps: number }
    >();
    // Per-jobType breakdown — used for the diagnostic on opps overcounting.
    type TypeStats = { name: string; jobs: number; opps: number; closed: number };
    const byType = new Map<number, TypeStats>();
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
      const opp = isOpportunity(j, jobTypeMap, soldByJob);
      const closed = isClosedOpportunity(j, jobTypeMap, soldByJob);
      if (opp) entry.opps += 1;
      if (closed) entry.closedOpps += 1;

      const typeId = j.jobTypeId ?? 0;
      const typeName = jobTypeSettings(j, jobTypeMap).name;
      if (!byType.has(typeId)) byType.set(typeId, { name: typeName, jobs: 0, opps: 0, closed: 0 });
      const ts = byType.get(typeId)!;
      ts.jobs += 1;
      if (opp) ts.opps += 1;
      if (closed) ts.closed += 1;
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

    const totalJobs = Array.from(agg.values()).reduce((s, r) => s + r.jobs, 0);
    const totalOpps = Array.from(agg.values()).reduce((s, r) => s + r.opps, 0);
    const totalClosed = Array.from(agg.values()).reduce((s, r) => s + r.closedOpps, 0);
    const closeRatePct = totalOpps > 0 ? Math.round((totalClosed / totalOpps) * 10000) / 100 : 0;
    let soldMatched = 0;
    for (const j of jobs) if (soldByJob.has(j.id)) soldMatched++;

    // Counts for the recall/warranty exclusion — used to verify the new
    // code is actually running in prod vs a stale deploy.
    let recallExcluded = 0, warrantyExcluded = 0, createdFromEstExcluded = 0;
    for (const j of jobs) {
      if (j.recallForId != null) recallExcluded++;
      if (j.warrantyId != null) warrantyExcluded++;
      if (j.createdFromEstimateId != null) createdFromEstExcluded++;
    }

    const oppsByType = Array.from(byType.entries())
      .map(([typeId, s]) => ({
        typeId,
        name: s.name,
        jobs: s.jobs,
        opps: s.opps,
        closed: s.closed,
      }))
      .filter((r) => r.opps > 0)
      .sort((a, b) => b.opps - a.opps);

    return {
      runId,
      jobsFetched: fetched,
      rowsUpserted: upserted,
      jobsDropped: dropped,
      unmappedBusinessUnitIds: Array.from(unmapped).slice(0, 40),
      totals: {
        jobs: totalJobs,
        opportunities: totalOpps,
        closedOpportunities: totalClosed,
        closeRatePct,
        soldEstimatesMatched: soldMatched,
        recallFlagged: recallExcluded,
        warrantyFlagged: warrantyExcluded,
        createdFromEstimateFlagged: createdFromEstExcluded,
        oppsByType,
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
    await finishSyncRunError(runId, msg);
    throw err;
  }
}
