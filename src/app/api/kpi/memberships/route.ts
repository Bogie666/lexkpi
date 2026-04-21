/**
 * /api/kpi/memberships — reads the 12 most recent monthly snapshots per tier,
 * derives current vs LY vs LY2 active counts, new/churn/net.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { and, gte, lte, eq, asc, desc } from 'drizzle-orm';

import { db } from '@/db/client';
import { membershipDaily, membershipTiers } from '@/db/schema';
import { resolvePeriod } from '@/lib/period';
import type { MembershipsResponse } from '@/lib/types/kpi';

export const dynamic = 'force-dynamic';

async function latestSnapshotsPerTier(asOf: string) {
  const database = db();
  // Latest row per tier at or before asOf
  const rows = await database.execute<{
    membership_name: string;
    active_end: number;
    new_sales: number;
    canceled: number;
    net_change: number;
    report_date: string;
  }>(
    /* sql */ `
      SELECT DISTINCT ON (membership_name)
        membership_name,
        active_end,
        new_sales,
        canceled,
        net_change,
        report_date
      FROM membership_daily
      WHERE report_date <= '${asOf.replace(/'/g, '')}'
      ORDER BY membership_name, report_date DESC
    `,
  );
  // Neon HTTP's execute returns { rows }
  return (rows as unknown as { rows: Array<{ membership_name: string; active_end: number; new_sales: number; canceled: number; net_change: number; report_date: string; }> }).rows;
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const period = resolvePeriod({
    preset: params.get('preset'),
    from: params.get('from'),
    to: params.get('to'),
  });
  const database = db();

  const [curSnap, lySnap, ly2Snap, tiers] = await Promise.all([
    latestSnapshotsPerTier(period.cur.to),
    latestSnapshotsPerTier(period.ly.to),
    latestSnapshotsPerTier(period.ly2.to),
    database.select().from(membershipTiers).orderBy(asc(membershipTiers.sortOrder)),
  ]);

  const sumField = (rows: typeof curSnap, key: 'active_end' | 'new_sales' | 'canceled' | 'net_change') =>
    rows.reduce((s, r) => s + Number(r[key] ?? 0), 0);

  const active = sumField(curSnap, 'active_end');
  const newMonth = sumField(curSnap, 'new_sales');
  const churnMonth = sumField(curSnap, 'canceled');
  const netMonth = sumField(curSnap, 'net_change');

  const ly = {
    active: sumField(lySnap, 'active_end'),
    newMonth: sumField(lySnap, 'new_sales'),
    churnMonth: sumField(lySnap, 'canceled'),
    netMonth: sumField(lySnap, 'net_change'),
  };
  const ly2 = {
    active: sumField(ly2Snap, 'active_end'),
    newMonth: sumField(ly2Snap, 'new_sales'),
    churnMonth: sumField(ly2Snap, 'canceled'),
    netMonth: sumField(ly2Snap, 'net_change'),
  };

  // 12-month history — sum each month across all tiers
  const historyRows = await database
    .select()
    .from(membershipDaily)
    .where(
      and(
        lte(membershipDaily.reportDate, period.cur.to),
      ),
    )
    .orderBy(desc(membershipDaily.reportDate));

  // Bucket by month
  const byMonth = new Map<string, number>();
  for (const r of historyRows) {
    const key = r.reportDate.slice(0, 7); // YYYY-MM
    if (!byMonth.has(key)) byMonth.set(key, 0);
    byMonth.set(key, (byMonth.get(key) ?? 0) + Number(r.activeEnd));
  }
  // Turn into ordered list of the last 12 months up to period.cur.to
  const history = monthKeysBefore(period.cur.to, 12).map((k) => byMonth.get(k) ?? 0);
  const lyHistory = monthKeysBefore(period.ly.to, 12).map((k) => byMonth.get(k) ?? 0);

  // Per-tier breakdown using latest rows
  const curByTier = new Map(curSnap.map((r) => [r.membership_name, Number(r.active_end)]));
  const lyByTier = new Map(lySnap.map((r) => [r.membership_name, Number(r.active_end)]));

  const breakdown = tiers.map((t) => ({
    tier: t.name,
    count: curByTier.get(t.name) ?? 0,
    lyCount: lyByTier.get(t.name),
    price: Math.round(t.priceCents / 100),
    colorToken: t.colorToken,
  }));

  const body: MembershipsResponse = {
    active,
    goal: 10_000,
    newMonth,
    churnMonth,
    netMonth,
    newWeek: Math.round(newMonth / 4),
    ly,
    ly2,
    history,
    lyHistory,
    breakdown,
    meta: {
      period: period.preset ? period.preset.toUpperCase() : 'Custom',
      asOf: new Date().toISOString(),
      from: period.cur.from,
      to: period.cur.to,
    },
  };

  return NextResponse.json({ data: body });
}

/** `YYYY-MM` keys for the 12 months ending at `to` (chronological). */
function monthKeysBefore(to: string, n: number): string[] {
  const [y, m] = to.split('-').map(Number);
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}

// silence unused pg import in narrow builds
void eq;
