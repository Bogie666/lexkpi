/**
 * Target upsert endpoint. Minimal admin-panel primitive — lets us set or
 * update performance targets without re-running the whole seed (which
 * would wipe financial_daily and blow away real synced data).
 *
 *   POST /api/admin/targets
 *   Body: {
 *     metric: 'revenue' | 'close_rate' | 'memberships' | ...,
 *     scope: 'company' | 'department' | 'role' | 'employee',
 *     scopeValue: string | null,   // e.g. 'hvac_service' when scope='department'
 *     effectiveFrom: 'YYYY-MM-DD',
 *     effectiveTo: 'YYYY-MM-DD',
 *     targetValue: number,          // in the unit's canonical form (cents, bps, count)
 *     unit: 'cents' | 'bps' | 'count',
 *     notes?: string
 *   }
 *
 * Upsert key: (metric, scope, scopeValue, effectiveFrom, effectiveTo).
 * Returns the resulting row.
 *
 * Gated by CRON_SECRET until real auth lands.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { targets } from '@/db/schema';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const query = req.nextUrl.searchParams.get('secret');
  return bearer === secret || query === secret;
}

interface UpsertBody {
  metric: string;
  scope: 'company' | 'department' | 'role' | 'employee';
  scopeValue?: string | null;
  effectiveFrom: string;
  effectiveTo: string;
  targetValue: number;
  unit: 'cents' | 'bps' | 'count';
  notes?: string;
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: UpsertBody;
  try {
    body = (await req.json()) as UpsertBody;
  } catch {
    return NextResponse.json({ error: 'invalid json body' }, { status: 400 });
  }

  const required = ['metric', 'scope', 'effectiveFrom', 'effectiveTo', 'targetValue', 'unit'] as const;
  for (const k of required) {
    if (body[k] === undefined || body[k] === null) {
      return NextResponse.json({ error: `missing field: ${k}` }, { status: 400 });
    }
  }

  const database = db();
  const scopeValue = body.scopeValue ?? null;

  // Find an existing row at this exact window for this metric/scope.
  const existing = await database
    .select()
    .from(targets)
    .where(
      and(
        eq(targets.metric, body.metric),
        eq(targets.scope, body.scope),
        // scopeValue can be null for company-wide rows — Drizzle's eq treats
        // null correctly as IS NULL when the column is nullable.
        scopeValue === null
          ? // @ts-expect-error Drizzle supports this pattern for nullable columns
            eq(targets.scopeValue, null)
          : eq(targets.scopeValue, scopeValue),
        eq(targets.effectiveFrom, body.effectiveFrom),
        eq(targets.effectiveTo, body.effectiveTo),
      ),
    )
    .limit(1);

  if (existing.length) {
    const [row] = await database
      .update(targets)
      .set({
        targetValue: body.targetValue,
        unit: body.unit,
        notes: body.notes ?? existing[0].notes,
        updatedAt: new Date(),
      })
      .where(eq(targets.id, existing[0].id))
      .returning();
    return NextResponse.json({ ok: true, action: 'updated', row });
  }

  const [row] = await database
    .insert(targets)
    .values({
      metric: body.metric,
      scope: body.scope,
      scopeValue,
      effectiveFrom: body.effectiveFrom,
      effectiveTo: body.effectiveTo,
      targetValue: body.targetValue,
      unit: body.unit,
      notes: body.notes ?? null,
    })
    .returning();
  return NextResponse.json({ ok: true, action: 'inserted', row });
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const database = db();
  const rows = await database.select().from(targets);
  return NextResponse.json({ ok: true, count: rows.length, rows });
}
