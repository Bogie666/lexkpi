/**
 * Technicians sync (report-based). Pulls ST's pre-filtered role-specific
 * "Ryan ... Dashboard Tech KPI" reports for a period and upserts the
 * per-tech aggregates into `technician_period`. No daily granularity —
 * one row per (role, period, tech). For daily sparklines we'd need a
 * different data source; this fits the dashboard's rankings, team
 * rollups, and YoY compare views which all work at period level.
 *
 *   POST /api/sync/run?source=technician-reports
 *         body: { from, to }   (window for all 6 role reports)
 *
 * Rate limit: ST caps Reports API at 5 req/min per report. We pull one
 * report per role in sequence; the raw-client's throttle + retry keeps
 * us well under the limit.
 */
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { technicianPeriod } from '@/db/schema';
import { getAccessToken, readStConfig } from './auth';
import {
  startSyncRun,
  finishSyncRunSuccess,
  finishSyncRunError,
  type SyncTrigger,
} from '@/lib/sync/runs';

export const TECHNICIAN_REPORTS_SOURCE = 'st_technician_reports';

export interface SyncWindow {
  from: string;
  to: string;
}

export interface TechnicianReportsSyncResult {
  runId: number | null;
  skipped?: 'another_run_active';
  perRole: Array<{
    roleCode: string;
    reportId: string;
    rows: number;
    error?: string;
  }>;
  rowsUpserted: number;
}

/**
 * Role sub-tab → ST saved-report ID.
 * Each is category='business-unit-dashboard' on the tenant.
 * Confirmed pre-filtered to the right techs per role.
 */
const ROLE_REPORTS: Record<string, string> = {
  comfort_advisor: '374338685', // Ryan Sales Dashboard Tech KPI (DFW)
  hvac_tech: '374367121', // Ryan Service Dashboard Tech KPI (DFW)
  hvac_maintenance: '374418414', // Ryan Maintenance Dashboard Tech KPI (DFW)
  plumbing: '392071756', // Ryan Plumbing Dashboard Tech KPI (DFW)
  electrical: '392071757', // Ryan Electrical Dashboard Tech KPI (DFW)
  commercial_hvac: '398188829', // Ryan Commercial Dashboard Tech KPI (DFW)
};
const REPORT_CATEGORY = 'technician';

interface StReportDataPage {
  fields: Array<{ name: string; label?: string; dataType?: string }>;
  data: unknown[][];
  hasMore: boolean;
  totalCount?: number;
}

async function runStReport(
  categoryId: string,
  reportId: string,
  parameters: Array<{ name: string; value: unknown }>,
): Promise<StReportDataPage> {
  const cfg = readStConfig();
  const token = await getAccessToken();
  const url = `${cfg.apiBase}/reporting/v2/tenant/${cfg.tenantId}/report-category/${categoryId}/reports/${reportId}/data?pageSize=5000`;

  // Reports API is rate-limited separately (5/min/report). Simple one-shot
  // POST with retries on 429. Up to 6 retries with 15s * 2^n backoff up to
  // a 90s cap — covers a full minute of throttle if we accidentally burst.
  const MAX_ATTEMPTS = 6;
  let attempt = 0;
  while (true) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'ST-App-Key': cfg.appKey,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ parameters }),
    });
    if (res.status === 429 && attempt < MAX_ATTEMPTS) {
      const retryAfter = Number(res.headers.get('retry-after') ?? 0);
      const waitMs = Math.min(
        retryAfter > 0 ? retryAfter * 1000 : 15_000 * Math.pow(2, attempt),
        90_000,
      );
      await new Promise((r) => setTimeout(r, waitMs));
      attempt++;
      continue;
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`run report ${reportId}: ${res.status} ${body.slice(0, 300)}`);
    }
    return (await res.json()) as StReportDataPage;
  }
}

/** Parse ST report row → DB row shape. */
function parseRow(
  roleCode: string,
  window: SyncWindow,
  reportId: string,
  fields: string[],
  row: unknown[],
): typeof technicianPeriod.$inferInsert | null {
  const idx = (name: string) => fields.indexOf(name);
  const num = (name: string): number => {
    const i = idx(name);
    if (i < 0) return 0;
    const v = row[i];
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  const str = (name: string): string => {
    const i = idx(name);
    if (i < 0) return '';
    const v = row[i];
    return typeof v === 'string' ? v : v != null ? String(v) : '';
  };
  const cents = (name: string): number => Math.round(num(name) * 100);

  const empIdRaw = row[idx('TechnicianId')];
  if (empIdRaw == null) return null;
  const employeeId = typeof empIdRaw === 'number' ? empIdRaw : Number(empIdRaw);
  if (!Number.isFinite(employeeId)) return null;

  return {
    roleCode,
    periodStart: window.from,
    periodEnd: window.to,
    employeeId,
    employeeName: str('Name').trim() || `emp#${employeeId}`,
    completedJobs: Math.round(num('CompletedJobs')),
    completedRevenueCents: cents('CompletedRevenue'),
    opportunity: Math.round(num('Opportunity')),
    salesOpportunity: Math.round(num('SalesOpportunity')),
    closedOpportunities: Math.round(num('ClosedOpportunities')),
    closeRateBps: Math.round(num('CloseRate') * 10000) || null,
    totalSalesCents: cents('TotalSales'),
    optionsPerOpportunity: Math.round(num('OptionsPerOpportunity') * 100) || null,
    membershipsSold: Math.round(num('MembershipsSold')),
    leadsSet: Math.round(num('LeadsSet')),
    totalLeadSalesCents: cents('TotalLeadSales'),
    technicianBusinessUnit: str('TechnicianBusinessUnit').trim() || null,
    technicianTrade: str('TechnicianTrade').trim() || null,
    sourceReportId: reportId,
  };
}

export async function syncTechnicianReports(
  window: SyncWindow,
  trigger: SyncTrigger,
): Promise<TechnicianReportsSyncResult> {
  const start = await startSyncRun({
    source: TECHNICIAN_REPORTS_SOURCE,
    trigger,
    reportId: 'technician-reports',
    windowStart: window.from,
    windowEnd: window.to,
  });
  if (start.status === 'skipped') {
    return { runId: null, skipped: start.reason, perRole: [], rowsUpserted: 0 };
  }
  const runId = start.runId;

  try {
    const perRole: TechnicianReportsSyncResult['perRole'] = [];
    let totalUpserted = 0;
    const database = db();

    for (const [roleCode, reportId] of Object.entries(ROLE_REPORTS)) {
      try {
        const result = await runStReport(REPORT_CATEGORY, reportId, [
          { name: 'From', value: window.from },
          { name: 'To', value: window.to },
        ]);
        const fieldNames = (result.fields ?? []).map((f) => f.name);
        const rows: Array<typeof technicianPeriod.$inferInsert> = [];
        for (const raw of result.data ?? []) {
          const parsed = parseRow(roleCode, window, reportId, fieldNames, raw);
          if (parsed) rows.push(parsed);
        }

        // Purge stale rows for this (role, period) before reinsert. Tech
        // roster changes as reports get re-saved in ST; a simple upsert
        // would leave orphans behind.
        await database
          .delete(technicianPeriod)
          .where(
            and(
              eq(technicianPeriod.roleCode, roleCode),
              eq(technicianPeriod.periodStart, window.from),
              eq(technicianPeriod.periodEnd, window.to),
            ),
          );

        if (rows.length > 0) {
          for (let i = 0; i < rows.length; i += 500) {
            const batch = rows.slice(i, i + 500);
            await database
              .insert(technicianPeriod)
              .values(batch)
              .onConflictDoUpdate({
                target: [
                  technicianPeriod.roleCode,
                  technicianPeriod.periodStart,
                  technicianPeriod.periodEnd,
                  technicianPeriod.employeeId,
                ],
                set: {
                  employeeName: sql.raw(`excluded.employee_name`),
                  completedJobs: sql.raw(`excluded.completed_jobs`),
                  completedRevenueCents: sql.raw(`excluded.completed_revenue_cents`),
                  opportunity: sql.raw(`excluded.opportunity`),
                  salesOpportunity: sql.raw(`excluded.sales_opportunity`),
                  closedOpportunities: sql.raw(`excluded.closed_opportunities`),
                  closeRateBps: sql.raw(`excluded.close_rate_bps`),
                  totalSalesCents: sql.raw(`excluded.total_sales_cents`),
                  optionsPerOpportunity: sql.raw(`excluded.options_per_opportunity_x100`),
                  membershipsSold: sql.raw(`excluded.memberships_sold`),
                  leadsSet: sql.raw(`excluded.leads_set`),
                  totalLeadSalesCents: sql.raw(`excluded.total_lead_sales_cents`),
                  technicianBusinessUnit: sql.raw(`excluded.technician_business_unit`),
                  technicianTrade: sql.raw(`excluded.technician_trade`),
                  sourceReportId: sql.raw(`excluded.source_report_id`),
                  syncedAt: new Date(),
                },
              });
            totalUpserted += batch.length;
          }
        }

        perRole.push({ roleCode, reportId, rows: rows.length });
      } catch (err) {
        perRole.push({
          roleCode,
          reportId,
          rows: 0,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    await finishSyncRunSuccess(runId, {
      rowsFetched: perRole.reduce((s, r) => s + r.rows, 0),
      rowsUpserted: totalUpserted,
    });

    return { runId, perRole, rowsUpserted: totalUpserted };
  } catch (err) {
    const msg = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
    await finishSyncRunError(runId, msg);
    throw err;
  }
}
