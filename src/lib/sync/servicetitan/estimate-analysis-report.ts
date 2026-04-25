/**
 * Estimate Analysis sync (report-based). Pulls ST report 399168856
 * "RYAN Estimate Analysis (DFW)" (Operations category) for a date window
 * and replaces every row in `estimate_analysis` whose createdOn falls in
 * that window.
 *
 * Unlike the raw /sales/v2/estimates endpoint (which is open-only), this
 * report includes won/dismissed/unsold all in one shot with the analyst
 * fields the dashboard needs: tier selected, time-to-close, sold-on date,
 * department mapping.
 *
 * The exact field names emitted by the report aren't documented; the
 * parser below reads any of the common spellings ST uses across its
 * Operations reports and falls back to null if a column is missing.
 *
 * Scheduled 1×/day from cron (Estimate Analysis is slow-moving).
 */
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { businessUnits, estimateAnalysis } from '@/db/schema';
import { getAccessToken, readStConfig } from './auth';
import {
  startSyncRun,
  finishSyncRunSuccess,
  finishSyncRunError,
  type SyncTrigger,
} from '@/lib/sync/runs';

export const ESTIMATE_ANALYSIS_REPORT_SOURCE = 'st_estimate_analysis_report';

const REPORT_ID = '399168856';
const REPORT_CATEGORY = 'operations';

export interface EstimateAnalysisSyncResult {
  runId: number | null;
  skipped?: 'another_run_active';
  rowsFetched: number;
  rowsUpserted: number;
  rowsDropped: number;
  unmappedBusinessUnitIds: number[];
  windowFrom: string;
  windowTo: string;
}

export interface EstimateAnalysisSyncWindow {
  from: string; // YYYY-MM-DD
  to: string;
}

interface StReportDataPage {
  fields: Array<{ name: string; label?: string; dataType?: string }>;
  data: unknown[][];
  hasMore: boolean;
  totalCount?: number;
}

async function runStReport(
  parameters: Array<{ name: string; value: unknown }>,
  page = 1,
): Promise<StReportDataPage> {
  const cfg = readStConfig();
  const token = await getAccessToken();
  const url = `${cfg.apiBase}/reporting/v2/tenant/${cfg.tenantId}/report-category/${REPORT_CATEGORY}/reports/${REPORT_ID}/data?page=${page}&pageSize=5000`;

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
      throw new Error(`run report ${REPORT_ID}: ${res.status} ${body.slice(0, 300)}`);
    }
    return (await res.json()) as StReportDataPage;
  }
}

/** Try multiple column names; first hit wins. */
function pick(row: unknown[], fields: string[], names: string[]): unknown {
  for (const n of names) {
    const i = fields.indexOf(n);
    if (i >= 0) return row[i];
  }
  return undefined;
}

function asString(v: unknown): string {
  if (v == null) return '';
  return typeof v === 'string' ? v : String(v);
}

function asNumber(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function asISODate(v: unknown): string | null {
  const s = asString(v).trim();
  if (!s) return null;
  // ST sometimes emits ISO timestamps, sometimes just YYYY-MM-DD.
  const d = s.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  if (d.startsWith('0001-')) return null;
  return d;
}

/** Map ST status string → opportunityStatus enum used by the table. */
function normalizeStatus(raw: string): 'won' | 'unsold' | 'dismissed' | null {
  const s = raw.toLowerCase().trim();
  if (!s) return null;
  if (s.startsWith('sold') || s === 'won') return 'won';
  if (s.startsWith('open') || s === 'unsold' || s === 'pending') return 'unsold';
  if (s === 'dismissed' || s === 'declined' || s === 'cancelled' || s === 'canceled') {
    return 'dismissed';
  }
  // Fall through: treat anything else as unsold so we don't silently lose rows.
  return 'unsold';
}

/** Crude tier inference from the estimate name when ST doesn't surface it. */
function inferTier(name: string): 'low' | 'mid' | 'high' | null {
  const n = name.toLowerCase();
  if (!n) return null;
  if (/(^|\b)(good|basic|standard|economy|silver)(\b|$)/.test(n)) return 'low';
  if (/(^|\b)(better|mid|premier|gold)(\b|$)/.test(n)) return 'mid';
  if (/(^|\b)(best|premium|elite|platinum)(\b|$)/.test(n)) return 'high';
  return null;
}

interface ParsedRow {
  estimateId: string;
  jobId: number | null;
  status: 'won' | 'unsold' | 'dismissed';
  createdOn: string;
  soldOn: string | null;
  subtotalCents: number;
  businessUnitId: number | null;
  timeToCloseDays: number | null;
  tier: 'low' | 'mid' | 'high' | null;
}

function parseRow(fields: string[], row: unknown[]): ParsedRow | null {
  const id = pick(row, fields, ['EstimateId', 'EstimateID', 'Id', 'ID']);
  const estimateId = asString(id).trim();
  if (!estimateId) return null;

  const jobIdRaw = pick(row, fields, ['JobId', 'JobID']);
  const jobIdNum = jobIdRaw == null || jobIdRaw === '' ? null : Number(jobIdRaw);
  const jobId = Number.isFinite(jobIdNum) && jobIdNum !== null ? jobIdNum : null;

  const statusRaw = asString(
    pick(row, fields, ['Status', 'EstimateStatus', 'OpportunityStatus']),
  );
  const status = normalizeStatus(statusRaw);
  if (!status) return null;

  const createdOn =
    asISODate(pick(row, fields, ['CreatedOn', 'CreatedDate', 'DateCreated', 'EstimateDate'])) ??
    asISODate(pick(row, fields, ['SoldOn', 'SoldDate']));
  if (!createdOn) return null;

  const soldOn = asISODate(pick(row, fields, ['SoldOn', 'SoldDate', 'DateSold']));

  const subtotalDollars = asNumber(
    pick(row, fields, ['Subtotal', 'Total', 'Amount', 'EstimateTotal', 'GrandTotal']),
  );
  const subtotalCents = Math.round(subtotalDollars * 100);

  const buRaw = pick(row, fields, ['BusinessUnitId', 'BusinessUnitID', 'BusinessUnit']);
  let businessUnitId: number | null = null;
  if (buRaw != null && buRaw !== '') {
    const n = Number(buRaw);
    if (Number.isFinite(n)) businessUnitId = n;
  }

  // TTC: prefer an explicit days column; otherwise derive from soldOn-createdOn.
  let timeToCloseDays: number | null = null;
  const ttcRaw = pick(row, fields, ['TimeToCloseDays', 'DaysToClose', 'AgeDays']);
  if (ttcRaw != null && ttcRaw !== '') {
    const n = Number(ttcRaw);
    if (Number.isFinite(n)) timeToCloseDays = Math.max(0, Math.round(n));
  } else if (soldOn && createdOn) {
    const ms = Date.parse(soldOn) - Date.parse(createdOn);
    if (Number.isFinite(ms)) timeToCloseDays = Math.max(0, Math.round(ms / 86_400_000));
  }

  const tierRaw = asString(pick(row, fields, ['Tier', 'TierSelected', 'Option']));
  const tierName = asString(pick(row, fields, ['Name', 'EstimateName', 'Description']));
  const tier: 'low' | 'mid' | 'high' | null =
    (tierRaw ? normalizeTier(tierRaw) : null) ?? inferTier(tierName);

  return {
    estimateId,
    jobId,
    status,
    createdOn,
    soldOn,
    subtotalCents,
    businessUnitId,
    timeToCloseDays,
    tier,
  };
}

function normalizeTier(raw: string): 'low' | 'mid' | 'high' | null {
  const t = raw.toLowerCase().trim();
  if (!t) return null;
  if (['low', 'good', 'basic'].includes(t)) return 'low';
  if (['mid', 'better', 'premier'].includes(t)) return 'mid';
  if (['high', 'best', 'premium', 'elite'].includes(t)) return 'high';
  return null;
}

async function loadBuToDeptMap(): Promise<Map<number, string | null>> {
  const database = db();
  const rows = await database
    .select({ id: businessUnits.id, departmentCode: businessUnits.departmentCode })
    .from(businessUnits);
  return new Map(rows.map((r) => [r.id, r.departmentCode]));
}

export async function syncEstimateAnalysisReport(
  window: EstimateAnalysisSyncWindow,
  trigger: SyncTrigger,
): Promise<EstimateAnalysisSyncResult> {
  const start = await startSyncRun({
    source: ESTIMATE_ANALYSIS_REPORT_SOURCE,
    trigger,
    reportId: REPORT_ID,
    windowStart: window.from,
    windowEnd: window.to,
  });
  if (start.status === 'skipped') {
    return {
      runId: null,
      skipped: start.reason,
      rowsFetched: 0,
      rowsUpserted: 0,
      rowsDropped: 0,
      unmappedBusinessUnitIds: [],
      windowFrom: window.from,
      windowTo: window.to,
    };
  }
  const runId = start.runId;
  const unmapped = new Set<number>();

  try {
    const buToDept = await loadBuToDeptMap();

    // Pull every page.
    const allRows: unknown[][] = [];
    let fields: string[] = [];
    let page = 1;
    while (true) {
      const result = await runStReport(
        [
          { name: 'From', value: window.from },
          { name: 'To', value: window.to },
          { name: 'DateType', value: 'CreatedOn' },
        ],
        page,
      );
      if (page === 1) {
        fields = (result.fields ?? []).map((f) => f.name);
      }
      for (const r of result.data ?? []) allRows.push(r);
      if (!result.hasMore) break;
      page++;
      if (page > 100) break; // safety
    }

    const parsed: ParsedRow[] = [];
    let dropped = 0;
    for (const r of allRows) {
      const p = parseRow(fields, r);
      if (!p) {
        dropped++;
        continue;
      }
      parsed.push(p);
    }

    const dbRows: Array<typeof estimateAnalysis.$inferInsert> = [];
    for (const p of parsed) {
      let dept: string | null = null;
      if (p.businessUnitId != null) {
        if (buToDept.has(p.businessUnitId)) {
          dept = buToDept.get(p.businessUnitId) ?? null;
        } else {
          unmapped.add(p.businessUnitId);
        }
      }
      dbRows.push({
        estimateId: p.estimateId,
        jobId: p.jobId,
        opportunityStatus: p.status,
        soldOn: p.soldOn,
        createdOn: p.createdOn,
        subtotalCents: p.subtotalCents,
        departmentCode: dept,
        timeToCloseDays: p.timeToCloseDays,
        tierSelected: p.tier,
        sourceReportId: ESTIMATE_ANALYSIS_REPORT_SOURCE,
      });
    }

    const database = db();

    // Replace every row in the synced window so status flips (unsold → won)
    // are picked up. We don't touch rows outside the window — older data
    // stays intact even if the report is re-run for a smaller range later.
    await database
      .delete(estimateAnalysis)
      .where(
        and(
          gte(estimateAnalysis.createdOn, window.from),
          lte(estimateAnalysis.createdOn, window.to),
        ),
      );

    let upserted = 0;
    if (dbRows.length > 0) {
      for (let i = 0; i < dbRows.length; i += 500) {
        const batch = dbRows.slice(i, i + 500);
        await database
          .insert(estimateAnalysis)
          .values(batch)
          .onConflictDoUpdate({
            target: estimateAnalysis.estimateId,
            set: {
              jobId: sql.raw(`excluded.job_id`),
              opportunityStatus: sql.raw(`excluded.opportunity_status`),
              soldOn: sql.raw(`excluded.sold_on`),
              createdOn: sql.raw(`excluded.created_on`),
              subtotalCents: sql.raw(`excluded.subtotal_cents`),
              departmentCode: sql.raw(`excluded.department_code`),
              timeToCloseDays: sql.raw(`excluded.time_to_close_days`),
              tierSelected: sql.raw(`excluded.tier_selected`),
              sourceReportId: sql.raw(`excluded.source_report_id`),
              syncedAt: new Date(),
            },
          });
        upserted += batch.length;
      }
    }

    await finishSyncRunSuccess(runId, {
      rowsFetched: allRows.length,
      rowsUpserted: upserted,
    });

    return {
      runId,
      rowsFetched: allRows.length,
      rowsUpserted: upserted,
      rowsDropped: dropped,
      unmappedBusinessUnitIds: Array.from(unmapped).slice(0, 40),
      windowFrom: window.from,
      windowTo: window.to,
    };
  } catch (err) {
    const msg = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
    await finishSyncRunError(runId, msg);
    throw err;
  }
}

// silence unused imports in narrow builds
void eq;
