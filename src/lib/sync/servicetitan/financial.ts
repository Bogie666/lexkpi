/**
 * Sync the Financial (Accounting) report into financial_daily.
 *
 * ST report: 128062649 (category: accounting)
 *
 * Upsert key: (department_code, report_date)
 * On first run it also deletes any rows where source_report_id='seed' so
 * the fake April-2026 values from db:seed get replaced by real numbers.
 */
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { financialDaily } from '@/db/schema';
import {
  iterateReport,
  buildFieldIndex,
  cellDate,
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

export const FINANCIAL_REPORT_ID = '128062649';
export const FINANCIAL_CATEGORY = 'accounting';
export const FINANCIAL_SOURCE = 'st_financial';

export interface SyncWindow {
  from: string; // YYYY-MM-DD inclusive
  to: string;
}

export interface SyncResult {
  runId: number;
  rowsFetched: number;
  rowsUpserted: number;
  rowsDropped: number;
  unmappedBusinessUnits: string[];
}

interface FinancialRow {
  departmentCode: string;
  reportDate: string;
  totalRevenueCents: number;
  jobs: number;
  opportunities: number;
}

/**
 * Extract a row from the raw ST report response. The exact column names
 * vary by how the report was defined in the ST UI — we try a few common
 * names and fall through to null if none match.
 */
function extractRow(row: unknown[], fields: ReportField[]): FinancialRow | { skip: string } {
  const idx = buildFieldIndex(fields);

  // Business unit — try common names
  const buRaw =
    cellString(row, idx['BusinessUnit']) ??
    cellString(row, idx['Business Unit']) ??
    cellString(row, idx['BusinessUnitName']) ??
    cellString(row, idx['Business Unit Name']);
  const dept = mapBusinessUnitToDepartment(buRaw);
  if (!dept) return { skip: buRaw ?? '(null business unit)' };

  // Date
  const date =
    cellDate(row, idx['Date']) ??
    cellDate(row, idx['InvoiceDate']) ??
    cellDate(row, idx['Invoice Date']) ??
    cellDate(row, idx['ReportDate']);
  if (!date) return { skip: `no date on ${buRaw}` };

  // Revenue — ST Accounting reports usually return Total, sometimes broken out
  // into Invoiced/Completed/Adjustments. We sum what's available.
  const invoiced = cellNumber(row, idx['Total'])
    ?? cellNumber(row, idx['Total Revenue'])
    ?? cellNumber(row, idx['TotalRevenue'])
    ?? cellNumber(row, idx['Invoiced'])
    ?? cellNumber(row, idx['Invoiced Revenue'])
    ?? cellNumber(row, idx['Revenue'])
    ?? 0;

  const jobs =
    cellNumber(row, idx['Jobs']) ??
    cellNumber(row, idx['Job Count']) ??
    cellNumber(row, idx['JobCount']) ??
    0;
  const opps =
    cellNumber(row, idx['Opportunities']) ??
    cellNumber(row, idx['Opportunity Count']) ??
    cellNumber(row, idx['OpportunityCount']) ??
    0;

  return {
    departmentCode: dept,
    reportDate: date,
    totalRevenueCents: Math.round(invoiced * 100),
    jobs: Math.round(jobs),
    opportunities: Math.round(opps),
  };
}

/**
 * After a successful sync, replace any remaining `source_report_id='seed'`
 * rows in the window with the newly synced ones. Runs once the ingest is
 * committed so we never end up with *no* rows if ST is slow.
 */
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
    // Aggregate in memory by (dept, date) since ST returns row-per-BU-per-day
    // already, but we defend against duplicate rows just in case.
    const agg = new Map<string, FinancialRow>();

    for await (const { row, fields } of iterateReport({
      category: FINANCIAL_CATEGORY,
      reportId: FINANCIAL_REPORT_ID,
      parameters: [
        { name: 'From', value: window.from },
        { name: 'To', value: window.to },
      ],
    })) {
      fetched++;
      const res = extractRow(row, fields);
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

      // Now safe to remove any seed rows in the same window
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
      unmappedBusinessUnits: Array.from(unmapped).slice(0, 20),
    };
  } catch (err) {
    const msg = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
    await finishSyncRunError(runId, msg);
    throw err;
  }
}
