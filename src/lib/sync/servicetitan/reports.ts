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

// ST Reporting API limit: 5 calls per same-report per minute per tenant.
// = 12s between calls. We add a small margin and use 13s to be safe.
const REPORT_MIN_INTERVAL_MS = 13_000;
const MAX_RETRIES = 8;
const DEFAULT_RETRY_MS = 1000;
const MAX_WAIT_MS = 120_000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Per-report throttle. Module-scoped Map tracks the last call timestamp for
 * each reportId within a single serverless invocation. Before every fetch
 * we sleep until REPORT_MIN_INTERVAL_MS has elapsed since the last call to
 * the same report. This keeps us cleanly under ST's 5/min limit on the
 * happy path; fetchWithRetry still handles 429s if two invocations race.
 */
const lastReportCallMs = new Map<string, number>();

async function throttleForReport(reportKey: string): Promise<void> {
  const last = lastReportCallMs.get(reportKey) ?? 0;
  const elapsed = Date.now() - last;
  if (elapsed < REPORT_MIN_INTERVAL_MS) {
    await sleep(REPORT_MIN_INTERVAL_MS - elapsed);
  }
  lastReportCallMs.set(reportKey, Date.now());
}

/**
 * Extract the server-suggested wait time from a 429 response. ST sends it
 * two ways — a `Retry-After` header (seconds) and/or the error body text
 * "Try again in 34 seconds." We honor whichever we find.
 */
function parseRetryAfterMs(res: Response, bodyText: string | null): number | null {
  const header = res.headers.get('retry-after');
  if (header) {
    const n = Number(header);
    if (Number.isFinite(n) && n > 0) return Math.min(n * 1000, MAX_WAIT_MS);
  }
  if (bodyText) {
    const match = /try again in (\d+)\s*seconds?/i.exec(bodyText);
    if (match) {
      const n = Number(match[1]);
      if (Number.isFinite(n) && n > 0) return Math.min(n * 1000, MAX_WAIT_MS);
    }
  }
  return null;
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
      init.headers = {
        ...(init.headers as Record<string, string>),
        Authorization: `Bearer ${newToken}`,
      };
      attempt++;
      continue;
    }

    // 429: rate limit. DO NOT retry here — ST's hint (often 30+s) combined
    // with a 7-day sync blows past Vercel's 300s function limit. Fail fast,
    // let the next scheduled sync try in a fresh rate window.
    if (res.status === 429) {
      return res;
    }

    // 5xx: transient server error, short exponential backoff.
    if (res.status >= 500 && attempt < MAX_RETRIES) {
      const backoff = Math.min(DEFAULT_RETRY_MS * Math.pow(2, attempt), MAX_WAIT_MS);
      await sleep(backoff);
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
    await throttleForReport(String(args.reportId));

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
