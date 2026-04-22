/**
 * Debug helper — fetch a single page of any ST resource endpoint and return
 * the raw JSON. Lets us inspect field shapes before writing real syncs.
 *
 *   GET /api/sync/debug-raw?path=/accounting/v2/tenant/{tenant}/invoices
 *       &query.invoicedOnOrAfter=2026-04-15&query.pageSize=3
 *
 * `path` supports the literal `{tenant}` placeholder, which the raw client
 * fills in. Any query string key prefixed with `query.` is passed through
 * to ST.
 *
 * Gated by CRON_SECRET.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { fetchResourcePage } from '@/lib/sync/servicetitan/raw-client';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const query = req.nextUrl.searchParams.get('secret');
  return bearer === secret || query === secret;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const path = params.get('path');
  if (!path) {
    return NextResponse.json(
      {
        error: 'path query param required',
        examples: [
          '/accounting/v2/tenant/{tenant}/invoices',
          '/jpm/v2/tenant/{tenant}/jobs',
          '/sales/v2/tenant/{tenant}/estimates',
          '/settings/v2/tenant/{tenant}/business-units',
          '/telecom/v3/tenant/{tenant}/calls',
          '/memberships/v2/tenant/{tenant}/memberships',
        ],
      },
      { status: 400 },
    );
  }

  const pageSize = Math.min(Number(params.get('pageSize') ?? 3), 50);
  const page = Number(params.get('page') ?? 1);

  // Forward any `query.<name>` params straight to ST.
  const stQuery: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    if (key.startsWith('query.')) stQuery[key.slice('query.'.length)] = value;
  }

  try {
    const result = await fetchResourcePage({
      path,
      query: stQuery,
      pageSize,
      page,
    });
    return NextResponse.json({
      ok: true,
      path,
      query: stQuery,
      page: result.page,
      pageSize: result.pageSize,
      hasMore: result.hasMore,
      totalCount: result.totalCount,
      returned: result.data?.length ?? 0,
      sample: result.data,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
