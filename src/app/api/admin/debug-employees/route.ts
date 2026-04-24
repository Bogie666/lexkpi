/**
 * One-off diagnostic. Pulls a sample of employees and technicians from ST
 * to see what fields are available for the real Technicians sync.
 *
 *   GET /api/admin/debug-employees
 *
 * Samples:
 *   - /settings/v2/tenant/{tenant}/employees (office staff)
 *   - /dispatch/v2/tenant/{tenant}/technicians (field techs)
 *   - One appointment with technician assignments
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

interface StAny {
  id: number;
  [key: string]: unknown;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const out: Record<string, unknown> = {};

  // 1. Technicians (dispatch role — the sales-oriented ones)
  try {
    const techs = await collectResource<StAny>({
      path: '/dispatch/v2/tenant/{tenant}/technicians',
      query: { active: 'true' },
      pageSize: 50,
    });
    out.technicians = {
      count: techs.length,
      keysSeen: Array.from(new Set(techs.flatMap((t) => Object.keys(t)))).sort(),
      sample: techs.slice(0, 3),
    };
  } catch (err) {
    out.technicians = { error: err instanceof Error ? err.message : String(err) };
  }

  // 2. Employees (active + inactive — need inactive for historical data
  //    attribution since terminated employees still have soldById on
  //    historical jobs).
  try {
    const emps = await collectResource<StAny>({
      path: '/settings/v2/tenant/{tenant}/employees',
      query: { active: 'any' }, // no filter — get everyone
      pageSize: 500,
    });
    // Count distinct role string values so we see all categories
    const roleCounts: Record<string, number> = {};
    for (const e of emps) {
      const r = typeof e.role === 'string' ? e.role : '(no-role)';
      roleCounts[r] = (roleCounts[r] ?? 0) + 1;
    }
    out.employees = {
      count: emps.length,
      activeCount: emps.filter((e) => e.active === true).length,
      roleCounts,
      keysSeen: Array.from(new Set(emps.flatMap((e) => Object.keys(e)))).sort(),
      sampleActive: emps.find((e) => e.active === true) ?? null,
      sampleInactive: emps.find((e) => e.active === false) ?? null,
    };
  } catch (err) {
    out.employees = { error: err instanceof Error ? err.message : String(err) };
  }

  // 3. One appointment to see tech-assignment shape
  try {
    const appts = await fetchResourcePage<StAny>({
      path: '/jpm/v2/tenant/{tenant}/appointments',
      query: {
        modifiedOnOrAfter: new Date(Date.now() - 7 * 86_400_000).toISOString(),
      },
      pageSize: 1,
    });
    out.appointments = {
      count: appts.data?.length ?? 0,
      keysSeen: Array.from(new Set((appts.data ?? []).flatMap((a) => Object.keys(a)))).sort(),
      sample: appts.data?.[0] ?? null,
    };
  } catch (err) {
    out.appointments = { error: err instanceof Error ? err.message : String(err) };
  }

  // 4. One assignment (links appointment → technician)
  try {
    const assigns = await fetchResourcePage<StAny>({
      path: '/dispatch/v2/tenant/{tenant}/appointment-assignments',
      query: {
        modifiedOnOrAfter: new Date(Date.now() - 7 * 86_400_000).toISOString(),
      },
      pageSize: 3,
    });
    out.assignments = {
      count: assigns.data?.length ?? 0,
      keysSeen: Array.from(new Set((assigns.data ?? []).flatMap((a) => Object.keys(a)))).sort(),
      sample: assigns.data?.[0] ?? null,
    };
  } catch (err) {
    out.assignments = { error: err instanceof Error ? err.message : String(err) };
  }

  return NextResponse.json({ ok: true, ...out });
}
