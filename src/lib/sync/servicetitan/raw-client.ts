/**
 * Generic ServiceTitan resource-endpoint client.
 *
 * Unlike the Reports API (5/min/report), resource endpoints like
 *   /accounting/v2/invoices
 *   /jpm/v2/jobs
 *   /sales/v2/estimates
 *   /telecom/v3/calls
 * share a much friendlier rate limit (~60/min/tenant). We add a 500ms cushion
 * between calls and honor Retry-After if ST ever pushes back.
 *
 * Standard response shape:
 *   { page, pageSize, hasMore, totalCount, data: T[] }
 * Paginate via `page` query param.
 */
import { getAccessToken, invalidateAccessToken, readStConfig, type StConfig } from './auth';

const DEFAULT_PAGE_SIZE = 500;
const MIN_INTERVAL_MS = 500;
const MAX_RETRIES = 5;
const DEFAULT_RETRY_MS = 1000;
const MAX_WAIT_MS = 60_000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

let lastCallMs = 0;
async function throttle(): Promise<void> {
  const elapsed = Date.now() - lastCallMs;
  if (elapsed < MIN_INTERVAL_MS) await sleep(MIN_INTERVAL_MS - elapsed);
  lastCallMs = Date.now();
}

function parseRetryAfterMs(res: Response): number | null {
  const header = res.headers.get('retry-after');
  if (!header) return null;
  const n = Number(header);
  if (Number.isFinite(n) && n > 0) return Math.min(n * 1000, MAX_WAIT_MS);
  return null;
}

async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  let attempt = 0;
  while (true) {
    await throttle();
    const res = await fetch(url, init);

    if (res.status === 401 && attempt === 0) {
      invalidateAccessToken();
      const token = await getAccessToken();
      init.headers = { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}` };
      attempt++;
      continue;
    }

    if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
      const waitMs = parseRetryAfterMs(res) ?? Math.min(DEFAULT_RETRY_MS * Math.pow(2, attempt), MAX_WAIT_MS);
      await sleep(waitMs);
      attempt++;
      continue;
    }

    return res;
  }
}

export interface ResourcePage<T> {
  page: number;
  pageSize: number;
  hasMore: boolean;
  totalCount?: number | null;
  data: T[];
}

export interface ResourceQueryArgs {
  /** Path under the tenant, e.g. '/accounting/v2/invoices'. */
  path: string;
  /** Query string params. Arrays get repeated (`foo=1&foo=2`). */
  query?: Record<string, string | number | boolean | string[] | undefined>;
  pageSize?: number;
  cfg?: StConfig;
}

function encodeQuery(q: Record<string, string | number | boolean | string[] | undefined>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) {
      for (const item of v) parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(item))}`);
    } else {
      parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    }
  }
  return parts.join('&');
}

/**
 * Yield every record from a paginated ST resource endpoint, one at a time.
 * Caller can break early; pagination follows until `hasMore === false`.
 */
export async function* iterateResource<T = unknown>(args: ResourceQueryArgs): AsyncGenerator<T> {
  const cfg = args.cfg ?? readStConfig();
  const token = await getAccessToken(cfg);
  const pageSize = args.pageSize ?? DEFAULT_PAGE_SIZE;
  const baseQuery = { ...(args.query ?? {}), pageSize };

  let page = 1;
  while (true) {
    const qs = encodeQuery({ ...baseQuery, page });
    const url = `${cfg.apiBase}${args.path.replace('{tenant}', cfg.tenantId)}${qs ? `?${qs}` : ''}`;

    const res = await fetchWithRetry(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'ST-App-Key': cfg.appKey,
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`ST ${args.path} failed: ${res.status} ${res.statusText} ${body.slice(0, 500)}`);
    }

    const json = (await res.json()) as ResourcePage<T>;
    for (const item of json.data ?? []) yield item;
    if (!json.hasMore) return;
    page++;
  }
}

/** Convenience: collect all records into an array. */
export async function collectResource<T = unknown>(args: ResourceQueryArgs): Promise<T[]> {
  const out: T[] = [];
  for await (const item of iterateResource<T>(args)) out.push(item);
  return out;
}

/**
 * Fetch a single page of a resource endpoint (for debug/introspection).
 * Returns the full ResourcePage so the caller can inspect hasMore/totalCount.
 */
export async function fetchResourcePage<T = unknown>(
  args: ResourceQueryArgs & { page?: number },
): Promise<ResourcePage<T>> {
  const cfg = args.cfg ?? readStConfig();
  const token = await getAccessToken(cfg);
  const qs = encodeQuery({
    ...(args.query ?? {}),
    page: args.page ?? 1,
    pageSize: args.pageSize ?? 50,
  });
  const url = `${cfg.apiBase}${args.path.replace('{tenant}', cfg.tenantId)}${qs ? `?${qs}` : ''}`;

  const res = await fetchWithRetry(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'ST-App-Key': cfg.appKey,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`ST ${args.path} failed: ${res.status} ${res.statusText} ${body.slice(0, 500)}`);
  }
  return (await res.json()) as ResourcePage<T>;
}
