/**
 * One-off: pull a small sample of memberships (both active & canceled)
 * to see what fields exist for reconstructing historical active counts.
 *
 *   GET /api/admin/debug-memberships
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { fetchResourcePage, collectResource } from '@/lib/sync/servicetitan/raw-client';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const query = req.nextUrl.searchParams.get('secret');
  return bearer === secret || query === secret;
}

interface StAny { id: number; [key: string]: unknown }

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const activePage = await fetchResourcePage<StAny>({
      path: '/memberships/v2/tenant/{tenant}/memberships',
      query: { status: 'Active' },
      pageSize: 5,
    });
    const canceledPage = await fetchResourcePage<StAny>({
      path: '/memberships/v2/tenant/{tenant}/memberships',
      query: { status: 'Canceled' },
      pageSize: 5,
    });
    const noFilterPage = await fetchResourcePage<StAny>({
      path: '/memberships/v2/tenant/{tenant}/memberships',
      query: {},
      pageSize: 5,
    });

    // count all memberships across statuses (with totalCount header if available)
    const all = await collectResource<StAny>({
      path: '/memberships/v2/tenant/{tenant}/memberships',
      query: {},
      pageSize: 500,
    });
    const statusCounts: Record<string, number> = {};
    for (const m of all) {
      const s = typeof m.status === 'string' ? m.status : '(none)';
      statusCounts[s] = (statusCounts[s] ?? 0) + 1;
    }

    return NextResponse.json({
      ok: true,
      totalAcrossStatuses: all.length,
      statusCounts,
      activeKeys: Array.from(new Set((activePage.data ?? []).flatMap((m) => Object.keys(m)))).sort(),
      canceledKeys: Array.from(new Set((canceledPage.data ?? []).flatMap((m) => Object.keys(m)))).sort(),
      noFilterKeys: Array.from(new Set((noFilterPage.data ?? []).flatMap((m) => Object.keys(m)))).sort(),
      activeSample: activePage.data?.[0] ?? null,
      canceledSample: canceledPage.data?.[0] ?? null,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
