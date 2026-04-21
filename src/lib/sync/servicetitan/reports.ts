/**
 * Generic ServiceTitan Reports API client.
 *
 * Usage:
 *   for await (const row of iterateReport({ category, reportId, parameters })) {
 *     const record = mapRow(row);
 *     ...
 *   }
 *
 * Handles:
 *   - OAuth token auth + refresh on 401
 *   - Continuation-token pagination
 *   - 429 + 5xx exponential backoff (5 retries capped at 10s)
 *   - 500ms cushion between pages to stay under ST rate limits
 */
import { getAccessToken, invalidateAccessToken, readStConfig, type StConfig } from './auth';

export interface ReportField {
  name: string;
  label?: string;
  dataType: string;
}

export interface ReportPage {
  fields: ReportField[];
  data: unknown[][];
  hasMore?: boolean;
  continuationToken?: string | null;
}

export interface FetchReportArgs {
  category: string; // e.g. 'accounting', 'operations', 'technician', 'marketing'
  reportId: string | number;
  parameters?: Array<{ name: string; value: string | number | boolean }>;
  pageSize?: number;
  cfg?: StConfig;
}

const PAGE_CUSHION_MS = 500;
const MAX_RETRIES = 5;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  let attempt = 0;
  while (true) {
    const res = await fetch(url, init);

    // 401: token expired mid-flight. Refresh once and retry.
    if (res.status === 401 && attempt === 0) {
      invalidateAccessToken();
      const cfg = readStConfig();
      const newToken = await getAccessToken(cfg);
      init.headers = { ...(init.headers as Record<string, string>), Authorization: `Bearer ${newToken}` };
      attempt++;
      continue;
    }

    // 429 or 5xx: exponential backoff
    if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
      const waitMs = Math.min(1000 * Math.pow(2, attempt), 10_000);
      await sleep(waitMs);
      attempt++;
      continue;
    }

    return res;
  }
}

/**
 * Yields each raw row of a report. Each row is an array of values matching
 * the column order in `fields`. Use `buildFieldIndex()` to make a name→index
 * map once per sync call.
 */
export async function* iterateReport(args: FetchReportArgs): AsyncGenerator<{
  row: unknown[];
  fields: ReportField[];
}> {
  const cfg = args.cfg ?? readStConfig();
  const token = await getAccessToken(cfg);

  const category = encodeURIComponent(args.category);
  const reportId = encodeURIComponent(String(args.reportId));
  const pageSize = args.pageSize ?? 5000;

  let continuationToken: string | null = null;
  let loggedFields: ReportField[] | null = null;

  do {
    const url = new URL(
      `${cfg.apiBase}/reporting/v2/tenant/${cfg.tenantId}/report-category/${category}/reports/${reportId}/data`,
    );
    url.searchParams.set('pageSize', String(pageSize));
    if (continuationToken) url.searchParams.set('continuationToken', continuationToken);

    const body = {
      parameters: args.parameters ?? [],
    };

    const res = await fetchWithRetry(url.toString(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'ST-App-Key': cfg.appKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(
        `ST report ${reportId} fetch failed: ${res.status} ${res.statusText} ${text.slice(0, 500)}`,
      );
    }

    const page = (await res.json()) as ReportPage;
    const fields = page.fields ?? [];
    if (!loggedFields) loggedFields = fields;

    for (const row of page.data ?? []) {
      yield { row, fields };
    }

    continuationToken = page.continuationToken ?? null;
    if (continuationToken) await sleep(PAGE_CUSHION_MS);
  } while (continuationToken);
}

/** Build a `name → column-index` lookup so mappers don't hard-code positions. */
export function buildFieldIndex(fields: ReportField[]): Record<string, number> {
  const out: Record<string, number> = {};
  fields.forEach((f, i) => {
    out[f.name] = i;
    // Some reports return labels like "Total Revenue"; map them too for flexibility.
    if (f.label && f.label !== f.name) out[f.label] = i;
  });
  return out;
}

/** Safe cell readers — coerce undefined → null, numeric strings → numbers. */
export function cellString(row: unknown[], idx: number | undefined): string | null {
  if (idx === undefined) return null;
  const v = row[idx];
  if (v === null || v === undefined) return null;
  return String(v);
}

export function cellNumber(row: unknown[], idx: number | undefined): number | null {
  if (idx === undefined) return null;
  const v = row[idx];
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function cellDate(row: unknown[], idx: number | undefined): string | null {
  if (idx === undefined) return null;
  const v = row[idx];
  if (!v) return null;
  const s = String(v);
  // ST usually returns ISO — trim to date-only
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // Fallback: parse as Date
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}
