/**
 * One-off diagnostic. Samples ST's /telecom/v3/calls endpoint to see
 * the fields available for building the call-center sync.
 *
 *   GET /api/admin/debug-calls?from=2026-04-22&to=2026-04-22
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { fetchResourcePage } from '@/lib/sync/servicetitan/raw-client';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const query = req.nextUrl.searchParams.get('secret');
  return bearer === secret || query === secret;
}

interface StCall {
  id: number;
  [key: string]: unknown;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const from = req.nextUrl.searchParams.get('from') ?? '2026-04-22';
  const to = req.nextUrl.searchParams.get('to') ?? from;

  try {
    const page = await fetchResourcePage<StCall>({
      path: '/telecom/v3/tenant/{tenant}/calls',
      query: {
        createdOnOrAfter: `${from}T00:00:00Z`,
        createdBefore: `${new Date(Date.parse(`${to}T00:00:00Z`) + 86_400_000).toISOString()}`,
      },
      pageSize: 25,
    });
    const rows = page.data ?? [];
    const keys = Array.from(new Set(rows.flatMap((r) => Object.keys(r)))).sort();
    return NextResponse.json({
      ok: true,
      totalCount: page.totalCount ?? null,
      sampleSize: rows.length,
      keysSeen: keys,
      sample: rows[0] ?? null,
      sampleSecond: rows[1] ?? null,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
