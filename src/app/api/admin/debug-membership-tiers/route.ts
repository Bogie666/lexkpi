/**
 * One-off: dumps the latest membership_daily row per tier so we can see
 * whether duplicate tier names (whitespace / case / variants) are
 * inflating the active sum.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { db } from '@/db/client';
import { membershipDaily } from '@/db/schema';

export const dynamic = 'force-dynamic';

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
  const database = db();
  const rows = await database.select().from(membershipDaily);

  // Latest row per tier name
  const latest = new Map<string, { date: string; active: number; source: string }>();
  for (const r of rows) {
    const prior = latest.get(r.membershipName);
    if (!prior || r.reportDate > prior.date) {
      latest.set(r.membershipName, {
        date: r.reportDate,
        active: Number(r.activeEnd),
        source: r.sourceReportId,
      });
    }
  }

  const items = Array.from(latest.entries())
    .map(([name, v]) => ({ name, date: v.date, active: v.active, source: v.source }))
    .sort((a, b) => b.active - a.active);

  const totalActive = items.reduce((s, i) => s + i.active, 0);

  // Also: look for whitespace/case variants — normalize name and bucket
  const byNormalized = new Map<string, string[]>();
  for (const i of items) {
    const norm = i.name.trim().toLowerCase();
    if (!byNormalized.has(norm)) byNormalized.set(norm, []);
    byNormalized.get(norm)!.push(i.name);
  }
  const duplicates = Array.from(byNormalized.entries())
    .filter(([, names]) => names.length > 1)
    .map(([norm, names]) => ({ normalized: norm, variants: names }));

  return NextResponse.json({
    ok: true,
    totalRows: rows.length,
    distinctTierNames: items.length,
    totalActiveSumAcrossLatest: totalActive,
    items,
    duplicates,
  });
}
