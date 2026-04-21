/**
 * Sync the Business-Unit-Dashboard Financial report into financial_daily.
 *
 * ST report: 394552917 (category: business-unit-dashboard)
 * Chosen over the vanilla Accounting report (128062649) because it carries
 * the full KPI set we need in one call: CompletedJobs, ClosedOpportunities,
 * pre-computed CloseRate, TotalJobAverage, plus RecallJobs / WarrantyJobs
 * for quality tracking.
 *
 * This report aggregates over the from/to window with one row per BU — no
 * per-row Date column — so we call it once per day for daily grain.
 *
 * Upsert key: (department_code, report_date)
 * After a successful sync we delete any rows with source_report_id='seed'
 * in the same window so the fake April-2026 values get replaced.
 */
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { financialDaily } from '@/db/schema';
import {
  iterateReport,
  buildFieldIndex,
  cellNumber,
  cellString,
  type ReportField,
} from './reports';
import { mapBusinessUnitToDepartment } from './mappings';
import {
  startSyncRun,
  finishSyncRunSuccess,
  finishSyncRunError,
  type SyncTrigger,
} from '@/lib/sync/runs';

export const FINANCIAL_REPORT_ID = '394552917';
export const FINANCIAL_CATEGORY = 'business-unit-dashboard';
export const FINANCIAL_SOURCE = 'st_financial';

export interface SyncWindow {
  from: string;
  to: string;
}

export interface SyncResult {
  runId: number;
  rowsFetched: number;
  rowsUpserted: number;
  rowsDropped: number;
  unmappedBusinessUnits: string[];
  daysSynced: number;
}

interface FinancialRow {
  departmentCode: string;
  reportDate: string;
  totalRevenueCents: number;
  jobs: number;
  opportunities: number;
}

function extractRow(
  row: unknown[],
  fields: ReportField[],
  reportDate: string,
): FinancialRow | { skip: string } {
  const idx = buildFieldIndex(fields);

  const name =
    cellString(row, idx['Name']) ??
    cellString(row, idx['BusinessUnit']) ??
    cellString(row, idx['Business Unit']);
  const dept = mapBusinessUnitToDepartment(name);
  if (!dept) return { skip: name ?? '(null name)' };

  // Revenue — 394552917 returns TotalRevenue as a decimal dollar amount
  const total =
    cellNumber(row, idx['TotalRevenue']) ??
    cellNumber(row, idx['Total Revenue']) ??
    0;

  // Jobs completed this window
  const jobs =
    cellNumber(row, idx['CompletedJobs']) ??
    cellNumber(row, idx['Completed Jobs']) ??
    0;

  const opps =
    cellNumber(row, idx['Opportunity']) ??
    cellNumber(row, idx['Opportunities']) ??
    0;

  return {
    departmentCode: dept,
    reportDate,
    totalRevenueCents: Math.round((total ?? 0) * 100),
    jobs: Math.round(jobs),
    opportunities: Math.round(opps),
  };
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

/** Enumerate every YYYY-MM-DD string in the inclusive [from, to] window. */
function daysIn(window: SyncWindow): string[] {
  const out: string[] = [];
  const start = new Date(`${window.from}T00:00:00Z`);
  const end = new Date(`${window.to}T00:00:00Z`);
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export async function syncFinancial(
  window: SyncWindow,
  trigger: SyncTrigger,
): Promise<SyncResult> {
  const runId = await startSyncRun({
    source: FINANCIAL_SOURCE,
    trigger,
    reportId: FINANCIAL_REPORT_ID,
    windowStart: window.from,
    windowEnd: window.to,
  });

  const unmapped = new Set<string>();
  let fetched = 0;
  let dropped = 0;

  try {
    const days = daysIn(window);
    // Aggregate per (dept, date). For a 7-day window we make 7 separate
    // ST calls, each of which returns ~25 rows. That's bounded and well
    // within rate limits.
    const agg = new Map<string, FinancialRow>();

    for (const day of days) {
      for await (const { row, fields } of iterateReport({
        category: FINANCIAL_CATEGORY,
        reportId: FINANCIAL_REPORT_ID,
        parameters: [
          { name: 'From', value: day },
          { name: 'To', value: day },
        ],
      })) {
        fetched++;
        const res = extractRow(row, fields, day);
        if ('skip' in res) {
          dropped++;
          unmapped.add(res.skip);
          continue;
        }
        const key = `${res.departmentCode}|${res.reportDate}`;
        const prev = agg.get(key);
        if (prev) {
          prev.totalRevenueCents += res.totalRevenueCents;
          prev.jobs += res.jobs;
          prev.opportunities += res.opportunities;
        } else {
          agg.set(key, res);
        }
      }
    }

    const rows = Array.from(agg.values()).map((r) => ({
      departmentCode: r.departmentCode,
      reportDate: r.reportDate,
      totalRevenueCents: r.totalRevenueCents,
      jobs: r.jobs,
      opportunities: r.opportunities,
      sourceReportId: FINANCIAL_REPORT_ID,
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
              totalRevenueCents: sql.raw(`excluded.total_revenue_cents`),
              jobs: sql.raw(`excluded.jobs`),
              opportunities: sql.raw(`excluded.opportunities`),
              sourceReportId: sql.raw(`excluded.source_report_id`),
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
      rowsFetched: fetched,
      rowsUpserted: upserted,
      rowsDropped: dropped,
      unmappedBusinessUnits: Array.from(unmapped).slice(0, 40),
      daysSynced: days.length,
    };
  } catch (err) {
    const msg = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
    await finishSyncRunError(runId, msg);
    throw err;
  }
}
