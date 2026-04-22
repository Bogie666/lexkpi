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
  // Window-wide roll-ups so we can compare directly to ST's report without
  // having to query the dashboard API after each sync.
  totals?: {
    jobs: number;
    opportunities: number;
    closedOpportunities: number;
    closeRatePct: number; // rounded to 2dp
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
  total?: number | string | null;
}

interface StJobType {
  id: number;
  soldThreshold?: number | null;
  noCharge?: boolean;
}

interface JobTypeSettings {
  thresholdCents: number;
  noCharge: boolean;
}

/**
 * Fallback settings for jobs whose jobTypeId isn't in the types map —
 * e.g. archived types. Threshold set low so we don't silently drop real
 * opps; noCharge defaults to false.
 */
const FALLBACK_SETTINGS: JobTypeSettings = {
  thresholdCents: 1 * 100,
  noCharge: false,
};

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

function jobTypeSettings(j: StJob, map: Map<number, JobTypeSettings>): JobTypeSettings {
  if (!j.jobTypeId) return FALLBACK_SETTINGS;
  return map.get(j.jobTypeId) ?? FALLBACK_SETTINGS;
}

/**
 * "No-Charge / Non-Opportunity" per ST: TRUE if the job itself is flagged
 * no-charge OR its JobType is flagged no-charge. Either surface marks the
 * job as a non-opp candidate (subject to the threshold override below).
 */
function isNoChargeEffective(j: StJob, settings: JobTypeSettings): boolean {
  return Boolean(j.noCharge) || settings.noCharge;
}

/**
 * ST's "Sales Opportunity" rule (per the team-provided definition):
 *
 *   A completed job counts as a sales opportunity if it is NOT marked
 *   No-Charge / Non-Opportunity. A no-charge job is still a sales
 *   opportunity if it has a sold estimate with subtotal ≥ the sales
 *   threshold set on the job's JobType. Warranty and recall status do
 *   NOT exclude a job from being a sales opportunity.
 *
 * We approximate "sold estimate subtotal" using the job's `total` field
 * (ST exposes the rolled-up total on the job record). When we later wire
 * the Estimates sync, swap in the precise value from the sold estimate.
 */
function isOpportunity(j: StJob, typeMap: Map<number, JobTypeSettings>): boolean {
  const s = jobTypeSettings(j, typeMap);
  if (!isNoChargeEffective(j, s)) return true;
  return jobTotalCents(j) >= s.thresholdCents;
}

/**
 * Closed Opportunity: a completed job whose sold-estimate subtotal is
 * ≥ the job type's sold threshold. Approximated with the job's `total`.
 */
function isClosedOpportunity(j: StJob, typeMap: Map<number, JobTypeSettings>): boolean {
  const s = jobTypeSettings(j, typeMap);
  return jobTotalCents(j) >= s.thresholdCents;
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
    m.set(t.id, { thresholdCents: threshold, noCharge: Boolean(t.noCharge) });
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
    const [buToDept, jobTypeMap] = await Promise.all([
      loadBuToDeptMap(),
      loadJobTypeSettings(),
    ]);

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
      if (isOpportunity(j, jobTypeMap)) entry.opps += 1;
      if (isClosedOpportunity(j, jobTypeMap)) entry.closedOpps += 1;
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
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
    await finishSyncRunError(runId, msg);
    throw err;
  }
}
