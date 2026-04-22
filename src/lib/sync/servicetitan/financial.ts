/**
 * Financial sync via ServiceTitan Invoices (raw resource endpoint).
 *
 * Replaces the earlier Reports-API-based sync. Each invoice has multiple
 * line items; each item carries its own business-unit-id. The `Total Revenue`
 * number on the old Business-Unit-Dashboard report is "sum of item totals,
 * bucketed by the item's BU, dated by the invoice date."  We replicate that
 * exactly here, then roll up into the 6 dashboard dept codes via the
 * business_units dimension table.
 *
 * Upsert key: (department_code, report_date)
 * After a successful sync we delete any rows with source_report_id='seed'
 * in the same window so the fake April-2026 values get replaced.
 */
import { and, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { businessUnits, financialDaily } from '@/db/schema';
import { collectResource } from './raw-client';
import {
  startSyncRun,
  finishSyncRunSuccess,
  finishSyncRunError,
  type SyncTrigger,
} from '@/lib/sync/runs';

export const FINANCIAL_SOURCE = 'st_financial';

export interface SyncWindow {
  from: string;
  to: string;
}

export interface SyncResult {
  runId: number | null;
  skipped?: 'another_run_active';
  invoicesFetched: number;
  itemsProcessed: number;
  rowsUpserted: number;
  itemsDropped: number;
  unmappedBusinessUnitIds: number[];
}

/**
 * Shape of an invoice item we care about. ST returns more fields; we pull
 * only the ones relevant to revenue accounting.
 */
interface StInvoiceItem {
  id: number;
  skuName?: string;
  type?: string;                    // 'Service', 'Material', 'Equipment', 'Labor', …
  total: number;                    // gross for this line item
  businessUnit?: { id: number; name?: string } | null;
  generalLedgerAccount?: { id: number; name?: string; type?: string } | null;
}

interface StInvoice {
  id: number;
  invoicedOn?: string | null;       // ISO date-time
  invoiceDate?: string | null;      // some ST tenants use this key
  status?: string;
  adjustmentToId?: number | null;
  items?: StInvoiceItem[];
  businessUnit?: { id: number; name?: string } | null;
  total?: number;
}

function dateOf(inv: StInvoice): string | null {
  const raw = inv.invoicedOn ?? inv.invoiceDate;
  if (!raw) return null;
  return raw.slice(0, 10);
}

/**
 * Decide whether a line item counts as "income" for Total Revenue.
 * Per ST's report definition: `Total Revenue = sum of all income items`.
 * The General Ledger Account type tells us; if it's missing (older items),
 * we fall back to counting most line types as income and excluding
 * known non-income buckets.
 */
function isIncomeItem(item: StInvoiceItem): boolean {
  const glType = item.generalLedgerAccount?.type?.toLowerCase();
  if (glType === 'income') return true;
  if (glType && glType !== 'income') return false;
  // Fallback: non-labor/non-equipment might be cost — but the Reports API
  // treats all items as income when GL is unset. Match that.
  return true;
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

async function loadBuToDeptMap(): Promise<Map<number, string | null>> {
  const database = db();
  const rows = await database
    .select({ id: businessUnits.id, departmentCode: businessUnits.departmentCode })
    .from(businessUnits);
  return new Map(rows.map((r) => [r.id, r.departmentCode]));
}

export async function syncFinancial(
  window: SyncWindow,
  trigger: SyncTrigger,
): Promise<SyncResult> {
  const start = await startSyncRun({
    source: FINANCIAL_SOURCE,
    trigger,
    reportId: 'invoices',
    windowStart: window.from,
    windowEnd: window.to,
  });
  if (start.status === 'skipped') {
    return {
      runId: null,
      skipped: start.reason,
      invoicesFetched: 0,
      itemsProcessed: 0,
      rowsUpserted: 0,
      itemsDropped: 0,
      unmappedBusinessUnitIds: [],
    };
  }
  const runId = start.runId;

  const unmappedBuIds = new Set<number>();
  let invoicesFetched = 0;
  let itemsProcessed = 0;
  let itemsDropped = 0;

  try {
    const buToDept = await loadBuToDeptMap();

    // Pull every invoice in the window (full records, items included).
    // ST accepts `invoicedOnOrAfter` / `invoicedOnOrBefore` as ISO datetimes;
    // anchor them to full-day boundaries to include the edges.
    const invoices = await collectResource<StInvoice>({
      path: '/accounting/v2/tenant/{tenant}/invoices',
      query: {
        invoicedOnOrAfter: `${window.from}T00:00:00Z`,
        invoicedOnOrBefore: `${window.to}T23:59:59Z`,
        includeTotal: true,
      },
    });
    invoicesFetched = invoices.length;

    // Aggregate by (dept_code, report_date) over all income items.
    const agg = new Map<string, { dept: string; date: string; totalCents: number }>();
    for (const inv of invoices) {
      const date = dateOf(inv);
      if (!date) continue;
      for (const item of inv.items ?? []) {
        itemsProcessed++;
        if (!isIncomeItem(item)) {
          itemsDropped++;
          continue;
        }
        const buId = item.businessUnit?.id ?? inv.businessUnit?.id;
        if (!buId) {
          itemsDropped++;
          continue;
        }
        if (!buToDept.has(buId)) {
          itemsDropped++;
          unmappedBuIds.add(buId);
          continue;
        }
        const dept = buToDept.get(buId);
        if (!dept) {
          // Known BU, explicitly dropped (e.g. ETX, Service Star).
          itemsDropped++;
          continue;
        }
        const cents = Math.round((item.total ?? 0) * 100);
        const key = `${dept}|${date}`;
        const prior = agg.get(key);
        if (prior) prior.totalCents += cents;
        else agg.set(key, { dept, date, totalCents: cents });
      }
    }

    const rows = Array.from(agg.values()).map((r) => ({
      departmentCode: r.dept,
      reportDate: r.date,
      totalRevenueCents: r.totalCents,
      // Jobs / opportunities land in a follow-up commit once the Jobs + Estimates
      // endpoints are wired. For now leave them at 0; the dashboard still
      // renders revenue correctly and computes close rate from technician_daily.
      jobs: 0,
      opportunities: 0,
      sourceReportId: 'st_invoices',
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
              sourceReportId: sql.raw(`excluded.source_report_id`),
              syncedAt: new Date(),
            },
          });
        upserted += batch.length;
      }
      await purgeSeedRowsForWindow(window);
    }

    await finishSyncRunSuccess(runId, {
      rowsFetched: invoicesFetched,
      rowsUpserted: upserted,
    });

    return {
      runId,
      invoicesFetched,
      itemsProcessed,
      rowsUpserted: upserted,
      itemsDropped,
      unmappedBusinessUnitIds: Array.from(unmappedBuIds).slice(0, 40),
    };
  } catch (err) {
    const msg = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
    await finishSyncRunError(runId, msg);
    throw err;
  }
}

// Silence unused-import warning in build paths that don't reach the table fn.
void inArray;
