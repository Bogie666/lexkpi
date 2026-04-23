/**
 * One-off diagnostic. Pulls a small sample of recent jobs from
 * /jpm/v2/jobs and returns the union of all keys + one full sample
 * record. Used to find opportunity-related boolean flags that might
 * gate ST's "Sales Opportunity" report.
 *
 *   GET /api/admin/debug-jobs?from=2026-04-01&to=2026-04-22
 *   GET /api/admin/debug-jobs?id=12345              // single job full record
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  collectResource,
  fetchResourcePage,
} from '@/lib/sync/servicetitan/raw-client';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const query = req.nextUrl.searchParams.get('secret');
  return bearer === secret || query === secret;
}

interface StJob {
  id: number;
  [key: string]: unknown;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const singleId = req.nextUrl.searchParams.get('id');
  const from = req.nextUrl.searchParams.get('from');
  const to = req.nextUrl.searchParams.get('to');

  try {
    if (singleId) {
      const record = await fetchResourcePage<StJob>({
        path: `/jpm/v2/tenant/{tenant}/jobs/${singleId}`,
        pageSize: 1,
      });
      return NextResponse.json({ ok: true, record });
    }

    // Pull a small sample via the standard paginated endpoint — just the
    // first page is enough for schema discovery.
    const jobs = await collectResource<StJob>({
      path: '/jpm/v2/tenant/{tenant}/jobs',
      query: {
        completedOnOrAfter: from ? `${from}T00:00:00Z` : undefined,
        completedOnOrBefore: to ? `${to}T23:59:59Z` : undefined,
        jobStatus: 'Completed',
      },
      pageSize: 50,
    });

    const sample = jobs.slice(0, 50);
    const allKeys = new Set<string>();
    for (const j of sample) for (const k of Object.keys(j)) allKeys.add(k);

    // Pluck likely opportunity-gating fields across every job in sample, so
    // we can see variation patterns.
    const suspects = sample.map((j) => {
      const pick: Record<string, unknown> = {
        id: j.id,
        jobTypeId: j.jobTypeId,
        jobStatus: j.jobStatus,
      };
      for (const k of Object.keys(j)) {
        const lk = k.toLowerCase();
        const v = j[k];
        if (
          lk.includes('opportunity') ||
          lk.includes('sales') ||
          lk.includes('charge') ||
          lk.includes('convert') ||
          lk.includes('lead') ||
          lk.includes('callback') ||
          lk.includes('recall') ||
          lk.includes('warranty') ||
          (typeof v === 'boolean' && !lk.startsWith('has'))
        ) {
          pick[k] = v;
        }
      }
      return pick;
    });

    return NextResponse.json({
      ok: true,
      sampleSize: sample.length,
      keysSeen: Array.from(allKeys).sort(),
      sampleFull: sample[0] ?? null,
      suspects,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
