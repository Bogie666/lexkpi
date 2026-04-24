/**
 * Technicians sync — Phase 1. Populates `technician_daily` with per-tech,
 * per-day job / opportunity / close-rate aggregates for a window.
 *
 * Revenue and avg-ticket attribution come in Phase 2 (requires pulling
 * invoice items with technicianId — much heavier).
 *
 * Data flow:
 *   1. Pull jobs in window (completedOnOrAfter / completedBefore)
 *   2. Pull assignments for the window (modifiedOnOrAfter=window.from) to
 *      resolve jobId → primary technician (technicianId + technicianName)
 *   3. For each job, bucket by (employeeId, completion_date, role_code),
 *      count jobs / opps / closed using the same simple rule as jobs.ts
 *   4. Upsert to technician_daily
 *
 * Role code mapping: dept → role (see DEPT_TO_ROLE below). Role codes
 * match the `technician_roles` dimension table the Technicians tab sub-
 * tabs read from.
 */
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { businessUnits, technicianDaily } from '@/db/schema';
import { collectResource } from './raw-client';
import {
  startSyncRun,
  finishSyncRunSuccess,
  finishSyncRunError,
  type SyncTrigger,
} from '@/lib/sync/runs';

export const TECHNICIANS_SOURCE = 'st_technicians';

export interface SyncWindow {
  from: string;
  to: string;
}

export interface TechniciansSyncResult {
  runId: number | null;
  skipped?: 'another_run_active';
  jobsFetched: number;
  employeesLoaded: number;
  rowsUpserted: number;
  jobsDropped: number;
  uniqueTechs: number;
}

interface StJob {
  id: number;
  jobStatus?: string;
  completedOn?: string | null;
  businessUnitId?: number | null;
  jobTypeId?: number | null;
  noCharge?: boolean;
  soldById?: number | null;
}

interface StEmployee {
  id: number;
  name?: string;
  firstName?: string;
  lastName?: string;
  active?: boolean;
}

interface StJobType {
  id: number;
  soldThreshold?: number | null;
}

interface StEstimate {
  id: number;
  jobId?: number | null;
  subtotal?: number | string | null;
}

/** Map our dept code → the technician_roles code used for sub-tabs. */
const DEPT_TO_ROLE: Record<string, string> = {
  hvac_service: 'hvac_tech',
  hvac_sales: 'comfort_advisor',
  hvac_maintenance: 'hvac_maintenance',
  plumbing: 'plumbing',
  commercial: 'commercial_hvac',
  electrical: 'electrical',
  // etx: no dedicated role — skip rather than miscategorize
};

const ESTIMATE_LOOKBACK_DAYS = 180;

function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function dateOf(j: StJob): string | null {
  if (!j.completedOn) return null;
  return j.completedOn.slice(0, 10);
}

function estimateSubtotalCents(e: StEstimate): number {
  const raw = e.subtotal;
  if (raw === null || raw === undefined) return 0;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

async function loadBuToDeptMap(): Promise<Map<number, string | null>> {
  const database = db();
  const rows = await database
    .select({ id: businessUnits.id, departmentCode: businessUnits.departmentCode })
    .from(businessUnits);
  return new Map(rows.map((r) => [r.id, r.departmentCode]));
}

async function loadJobTypeThresholds(): Promise<Map<number, number>> {
  const types = await collectResource<StJobType>({
    path: '/jpm/v2/tenant/{tenant}/job-types',
    query: {},
  });
  const m = new Map<number, number>();
  for (const t of types) {
    const dollars = t.soldThreshold;
    if (typeof dollars !== 'number' || !Number.isFinite(dollars)) continue;
    m.set(t.id, Math.round(dollars * 100));
  }
  return m;
}

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
 * Same simple rule as jobs.ts: opp if job.noCharge is false OR the job
 * has a sold estimate with subtotal ≥ the jobType's soldThreshold.
 */
function isOpportunity(
  j: StJob,
  thresholds: Map<number, number>,
  soldByJob: Map<number, number>,
): boolean {
  if (!j.noCharge) return true;
  const threshold = j.jobTypeId ? thresholds.get(j.jobTypeId) ?? 100 : 100;
  return (soldByJob.get(j.id) ?? 0) >= threshold;
}

function isClosedOpportunity(
  j: StJob,
  thresholds: Map<number, number>,
  soldByJob: Map<number, number>,
): boolean {
  if (!isOpportunity(j, thresholds, soldByJob)) return false;
  const threshold = j.jobTypeId ? thresholds.get(j.jobTypeId) ?? 100 : 100;
  return (soldByJob.get(j.id) ?? 0) >= threshold;
}

/**
 * Roster lookup: ST employee-or-technician id → display name.
 * ST's /settings/v2/employees endpoint only covers office staff and
 * admin users. Most field techs live in a separate "technicians"
 * roster, and their IDs get used as `soldById` on jobs they close.
 * We union the employees endpoint with technicianName/Id pairs
 * harvested from recent appointment-assignments so the soldById
 * attribution can resolve to a real name in either case.
 */
async function loadRosterNames(window: SyncWindow): Promise<Map<number, string>> {
  const m = new Map<number, string>();

  // 1. Employees endpoint — office, dispatchers, sales managers etc.
  const emps = await collectResource<StEmployee>({
    path: '/settings/v2/tenant/{tenant}/employees',
    query: { active: 'any' }, // include inactive — historical soldById still points to them
  });
  for (const e of emps) {
    const fallback = [e.firstName, e.lastName].filter(Boolean).join(' ');
    const name = e.name || fallback || `emp#${e.id}`;
    m.set(e.id, name.replace(/\s*\*$/, '')); // strip trailing asterisks
  }

  // 2. Technician roster via assignments in a ~90-day window around
  //    the sync window. One assignment per tech is enough for the name.
  const techs = await collectResource<{
    technicianId?: number | null;
    technicianName?: string | null;
  }>({
    path: '/dispatch/v2/tenant/{tenant}/appointment-assignments',
    query: {
      modifiedOnOrAfter: `${shiftDate(window.from, -90)}T00:00:00Z`,
    },
  });
  for (const t of techs) {
    if (!t.technicianId) continue;
    // Don't override an employee-endpoint entry; only fill gaps.
    if (m.has(t.technicianId)) continue;
    if (t.technicianName) m.set(t.technicianId, t.technicianName);
  }

  return m;
}

export async function syncTechnicians(
  window: SyncWindow,
  trigger: SyncTrigger,
): Promise<TechniciansSyncResult> {
  const start = await startSyncRun({
    source: TECHNICIANS_SOURCE,
    trigger,
    reportId: 'technicians',
    windowStart: window.from,
    windowEnd: window.to,
  });
  if (start.status === 'skipped') {
    return {
      runId: null,
      skipped: start.reason,
      jobsFetched: 0,
      employeesLoaded: 0,
      rowsUpserted: 0,
      jobsDropped: 0,
      uniqueTechs: 0,
    };
  }
  const runId = start.runId;

  try {
    const [buToDept, thresholds, soldByJob, empNames] = await Promise.all([
      loadBuToDeptMap(),
      loadJobTypeThresholds(),
      loadSoldEstimateSubtotals(window),
      loadRosterNames(window),
    ]);

    const jobs = await collectResource<StJob>({
      path: '/jpm/v2/tenant/{tenant}/jobs',
      query: {
        completedOnOrAfter: `${window.from}T00:00:00Z`,
        completedBefore: `${shiftDate(window.to, 1)}T00:00:00Z`,
        jobStatus: 'Completed',
      },
    });

    // Aggregate: key = employeeId|date|roleCode
    type Agg = {
      employeeId: number;
      employeeName: string;
      reportDate: string;
      roleCode: string;
      departmentCode: string;
      jobs: number;
      opps: number;
      closed: number;
    };
    const agg = new Map<string, Agg>();
    let dropped = 0;
    const uniqueTechs = new Set<number>();

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
      const dept = buToDept.get(buId);
      if (!dept) {
        dropped++;
        continue;
      }
      const role = DEPT_TO_ROLE[dept];
      if (!role) {
        dropped++;
        continue;
      }
      // Attribute by job.soldById. For installs, this is the Comfort
      // Advisor who closed the original estimate — not the installer
      // who did the physical work. For service jobs where the tech
      // sold their own upsell, soldById is the tech themselves. Jobs
      // with no soldById (diagnostic that didn't convert) have no
      // closer to credit; we drop them from tech stats.
      if (!j.soldById) {
        dropped++;
        continue;
      }
      const techId = j.soldById;
      const techName = empNames.get(techId) ?? `emp#${techId}`;
      uniqueTechs.add(techId);

      const key = `${techId}|${date}|${role}`;
      if (!agg.has(key)) {
        agg.set(key, {
          employeeId: techId,
          employeeName: techName,
          reportDate: date,
          roleCode: role,
          departmentCode: dept,
          jobs: 0,
          opps: 0,
          closed: 0,
        });
      }
      const entry = agg.get(key)!;
      entry.jobs += 1;
      if (isOpportunity(j, thresholds, soldByJob)) entry.opps += 1;
      if (isClosedOpportunity(j, thresholds, soldByJob)) entry.closed += 1;
    }

    // Build upsert rows. Revenue/avgTicket left at 0 for Phase 1.
    const rows = Array.from(agg.values()).map((r) => ({
      employeeId: r.employeeId,
      employeeName: r.employeeName,
      roleCode: r.roleCode,
      departmentCode: r.departmentCode,
      reportDate: r.reportDate,
      revenueCents: 0,
      jobsCompleted: r.jobs,
      closeRateBps: r.opps > 0 ? Math.round((r.closed / r.opps) * 10000) : null,
      recallRateBps: null,
      avgTicketCents: null,
      memberships: 0,
      leadsSet: 0,
      opportunities: r.opps,
      sourceReportId: TECHNICIANS_SOURCE,
    }));

    // Purge old st_technicians rows in this window BEFORE inserting.
    // Prior runs may have used different employeeIds (e.g. assignments'
    // technicianId vs job.soldById); without this purge those stale
    // rows linger and the dashboard shows a mix of both.
    const database = db();
    await database
      .delete(technicianDaily)
      .where(
        and(
          eq(technicianDaily.sourceReportId, TECHNICIANS_SOURCE),
          gte(technicianDaily.reportDate, window.from),
          lte(technicianDaily.reportDate, window.to),
        ),
      );

    let upserted = 0;
    if (rows.length > 0) {
      for (let i = 0; i < rows.length; i += 500) {
        const batch = rows.slice(i, i + 500);
        await database
          .insert(technicianDaily)
          .values(batch)
          .onConflictDoUpdate({
            target: [
              technicianDaily.employeeId,
              technicianDaily.reportDate,
              technicianDaily.roleCode,
            ],
            set: {
              employeeName: sql.raw(`excluded.employee_name`),
              departmentCode: sql.raw(`excluded.department_code`),
              jobsCompleted: sql.raw(`excluded.jobs_completed`),
              opportunities: sql.raw(`excluded.opportunities`),
              closeRateBps: sql.raw(`excluded.close_rate_bps`),
              // revenueCents intentionally not updated — Phase 2 writes it.
              sourceReportId: sql.raw(`excluded.source_report_id`),
              syncedAt: new Date(),
            },
          });
        upserted += batch.length;
      }
      // Wipe seed rows for the window so fake techs disappear.
      await database
        .delete(technicianDaily)
        .where(
          and(
            eq(technicianDaily.sourceReportId, 'seed'),
            gte(technicianDaily.reportDate, window.from),
            lte(technicianDaily.reportDate, window.to),
          ),
        );
    }

    await finishSyncRunSuccess(runId, {
      rowsFetched: jobs.length,
      rowsUpserted: upserted,
    });

    return {
      runId,
      jobsFetched: jobs.length,
      employeesLoaded: empNames.size,
      rowsUpserted: upserted,
      jobsDropped: dropped,
      uniqueTechs: uniqueTechs.size,
    };
  } catch (err) {
    const msg = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
    await finishSyncRunError(runId, msg);
    throw err;
  }
}
