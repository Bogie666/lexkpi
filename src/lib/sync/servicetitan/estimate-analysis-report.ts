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
  /** BU display names that didn't match any business_units row by name. */
  unmappedBusinessUnitNames: string[];
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
  /** Numeric BU id when the report exposes one, otherwise null. */
  businessUnitId: number | null;
  /** BU display name for fallback lookup against business_units.name. */
  businessUnitName: string | null;
  timeToCloseDays: number | null;
  tier: 'low' | 'mid' | 'high' | null;
}

function parseRow(fields: string[], row: unknown[]): ParsedRow | null {
  const id = pick(row, fields, ['EstimateId', 'EstimateID', 'Id', 'ID']);
  const estimateId = asString(id).trim();
  if (!estimateId) return null;

  // ST report 399168856 doesn't expose a numeric JobId, but ParentJobNumber
  // is usually a stringified integer and uniquely identifies the parent job.
  const jobIdRaw = pick(row, fields, [
    'JobId',
    'JobID',
    'ParentJobNumber',
    'ParentJobId',
  ]);
  const jobIdNum =
    jobIdRaw == null || jobIdRaw === '' ? null : Number(asString(jobIdRaw).trim());
  const jobId = jobIdNum != null && Number.isFinite(jobIdNum) ? jobIdNum : null;

  const statusRaw = asString(
    pick(row, fields, ['OpportunityStatus', 'EstimateStatus', 'Status']),
  );
  const status = normalizeStatus(statusRaw);
  if (!status) return null;

  const createdOn =
    asISODate(
      pick(row, fields, [
        'CreationDate',
        'CreatedOn',
        'CreatedDate',
        'DateCreated',
        'EstimateDate',
      ]),
    ) ?? asISODate(pick(row, fields, ['SoldOn', 'SoldDate']));
  if (!createdOn) return null;

  const soldOn = asISODate(pick(row, fields, ['SoldOn', 'SoldDate', 'DateSold']));

  const subtotalDollars = asNumber(
    pick(row, fields, ['Subtotal', 'Total', 'Amount', 'EstimateTotal', 'GrandTotal']),
  );
  const subtotalCents = Math.round(subtotalDollars * 100);

  // Numeric BU id is rare in this report; the string `BusinessUnit` (a
  // display name) is what's actually returned. We lookup the id later.
  const buNumericRaw = pick(row, fields, ['BusinessUnitId', 'BusinessUnitID']);
  let businessUnitId: number | null = null;
  if (buNumericRaw != null && buNumericRaw !== '') {
    const n = Number(buNumericRaw);
    if (Number.isFinite(n)) businessUnitId = n;
  }
  const buName = asString(pick(row, fields, ['BusinessUnit'])).trim() || null;

  // Time-to-close = (soldOn − createdOn) days when sold. The report's
  // EstimateAge column is age-as-of-today, NOT close time, so a job sold
  // the same day 6 months ago shows EstimateAge=180 — that would dump
  // every won estimate into the "8+ days" bucket. Always derive from
  // dates instead.
  let timeToCloseDays: number | null = null;
  if (soldOn && createdOn) {
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
    businessUnitName: buName,
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

interface BuMaps {
  byId: Map<number, string | null>;
  /** Lookup by lowercased trimmed name. */
  byName: Map<string, string | null>;
}

async function loadBuMaps(): Promise<BuMaps> {
  const database = db();
  const rows = await database
    .select({
      id: businessUnits.id,
      name: businessUnits.name,
      departmentCode: businessUnits.departmentCode,
    })
    .from(businessUnits);
  const byId = new Map<number, string | null>();
  const byName = new Map<string, string | null>();
  for (const r of rows) {
    byId.set(r.id, r.departmentCode);
    byName.set(r.name.trim().toLowerCase(), r.departmentCode);
  }
  return { byId, byName };
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
      unmappedBusinessUnitNames: [],
      windowFrom: window.from,
      windowTo: window.to,
    };
  }
  const runId = start.runId;
  const unmapped = new Set<number>();
  const unmappedNames = new Set<string>();

  try {
    const buMaps = await loadBuMaps();

    // Pull every page. DateType=3 is "Creation Date" per the report's
    // acceptValues definition (0=SoldOn, 1=FollowUp, 2=ParentCompletion,
    // 3=CreationDate). Using creation date so the window aligns with
    // the dashboard's createdOn-based aggregations.
    const allRows: unknown[][] = [];
    let fields: string[] = [];
    let page = 1;
    while (true) {
      const result = await runStReport(
        [
          { name: 'DateType', value: 3 },
          { name: 'From', value: window.from },
          { name: 'To', value: window.to },
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
      // Try numeric BU id first, then fall back to name lookup against
      // the business_units dim table — the report only ships a name.
      if (p.businessUnitId != null) {
        if (buMaps.byId.has(p.businessUnitId)) {
          dept = buMaps.byId.get(p.businessUnitId) ?? null;
        } else {
          unmapped.add(p.businessUnitId);
        }
      } else if (p.businessUnitName) {
        const key = p.businessUnitName.trim().toLowerCase();
        if (buMaps.byName.has(key)) {
          dept = buMaps.byName.get(key) ?? null;
        } else {
          unmappedNames.add(p.businessUnitName);
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
      unmappedBusinessUnitNames: Array.from(unmappedNames).slice(0, 40),
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
