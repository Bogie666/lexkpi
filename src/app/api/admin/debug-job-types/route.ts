/**
 * One-off diagnostic. Dumps the raw shape of ST's /jpm/v2/job-types page
 * so we can see what "sold threshold" / "opportunity" fields (if any) are
 * exposed per job type. Delete once we've wired the real threshold into
 * the Jobs sync.
 *
 *   GET /api/admin/debug-job-types
 *   GET /api/admin/debug-job-types?id=<jobTypeId>   // single type full record
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

interface StJobType {
  id: number;
  name?: string;
  active?: boolean;
  // Anything else ST returns — we dump the raw record to find threshold-like fields.
  [key: string]: unknown;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const singleId = req.nextUrl.searchParams.get('id');

  try {
    if (singleId) {
      // Single-type fetch: returns the full record so every field is visible.
      const record = await fetchResourcePage<StJobType>({
        path: `/jpm/v2/tenant/{tenant}/job-types/${singleId}`,
        pageSize: 1,
      });
      return NextResponse.json({ ok: true, id: Number(singleId), record });
    }

    // List all job types, include one sample record in full + a flat summary
    // of potentially-threshold fields per type.
    const types = await collectResource<StJobType>({
      path: '/jpm/v2/tenant/{tenant}/job-types',
      query: {},
      pageSize: 500,
    });

    // Pull every unique key we've ever seen across records so we can eyeball
    // which one is the threshold.
    const allKeys = new Set<string>();
    for (const t of types) {
      for (const k of Object.keys(t)) allKeys.add(k);
    }

    // Pluck likely threshold fields if present.
    const summary = types.map((t) => {
      const pick: Record<string, unknown> = {
        id: t.id,
        name: t.name,
        active: t.active,
      };
      for (const k of Object.keys(t)) {
        const lk = k.toLowerCase();
        if (
          lk.includes('threshold') ||
          lk.includes('opportunity') ||
          lk.includes('sold') ||
          lk.includes('soldhours')
        ) {
          pick[k] = t[k];
        }
      }
      return pick;
    });

    return NextResponse.json({
      ok: true,
      count: types.length,
      keysSeen: Array.from(allKeys).sort(),
      sampleFull: types[0] ?? null,
      summary,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
