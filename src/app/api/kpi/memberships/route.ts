/**
 * /api/kpi/memberships — reads membership_daily, derives current / LY / LY2
 * active counts from the latest row per tier, plus 12-month history.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { and, lte, asc } from 'drizzle-orm';

import { db } from '@/db/client';
import { membershipDaily, membershipTiers } from '@/db/schema';
import { resolvePeriod } from '@/lib/period';
import type { MembershipsResponse } from '@/lib/types/kpi';

export const dynamic = 'force-dynamic';

interface TierSnapshot {
  name: string;
  date: string;
  active: number;
  newSales: number;
  canceled: number;
  netChange: number;
}

/** Pick the latest row per tier at or before `asOf`. */
async function latestSnapshotsPerTier(asOf: string): Promise<TierSnapshot[]> {
  const database = db();
  const rows = await database
    .select()
    .from(membershipDaily)
    .where(lte(membershipDaily.reportDate, asOf));

  const latest = new Map<string, TierSnapshot>();
  for (const r of rows) {
    const prior = latest.get(r.membershipName);
    if (!prior || r.reportDate > prior.date) {
      latest.set(r.membershipName, {
        name: r.membershipName,
        date: r.reportDate,
        active: Number(r.activeEnd),
        newSales: Number(r.newSales),
        canceled: Number(r.canceled),
        netChange: Number(r.netChange),
      });
    }
  }
  return Array.from(latest.values());
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

  const sumField = (rows: TierSnapshot[], key: 'active' | 'newSales' | 'canceled' | 'netChange') =>
    rows.reduce((s, r) => s + r[key], 0);

  const active = sumField(curSnap, 'active');
  const newMonth = sumField(curSnap, 'newSales');
  const churnMonth = sumField(curSnap, 'canceled');
  const netMonth = sumField(curSnap, 'netChange');

  const ly = {
    active: sumField(lySnap, 'active'),
    newMonth: sumField(lySnap, 'newSales'),
    churnMonth: sumField(lySnap, 'canceled'),
    netMonth: sumField(lySnap, 'netChange'),
  };
  const ly2 = {
    active: sumField(ly2Snap, 'active'),
    newMonth: sumField(ly2Snap, 'newSales'),
    churnMonth: sumField(ly2Snap, 'canceled'),
    netMonth: sumField(ly2Snap, 'netChange'),
  };

  // 12-month history — sum active_end per month across all tiers, ending at period.cur.to
  const historyRows = await database
    .select()
    .from(membershipDaily)
    .where(and(lte(membershipDaily.reportDate, period.cur.to)));

  const byMonth = new Map<string, number>();
  for (const r of historyRows) {
    const key = r.reportDate.slice(0, 7);
    byMonth.set(key, (byMonth.get(key) ?? 0) + Number(r.activeEnd));
  }
  const history = monthKeysBefore(period.cur.to, 12).map((k) => byMonth.get(k) ?? 0);
  const lyHistory = monthKeysBefore(period.ly.to, 12).map((k) => byMonth.get(k) ?? 0);

  const lyByTier = new Map(lySnap.map((r) => [r.name, r.active]));

  // Lookup price / color by exact tier-name match against the
  // membership_tiers dimension table (which is still seed). Real ST type
  // names won't match, so falls back to 0 / rotating color palette.
  const tierMeta = new Map(tiers.map((t) => [t.name, t]));
  const FALLBACK_COLORS = [
    '--d-hvac_service',
    '--d-hvac_sales',
    '--d-hvac_maintenance',
    '--d-plumbing',
    '--d-commercial',
    '--d-electrical',
    '--d-etx',
  ];
  const breakdown = curSnap
    .slice()
    .sort((a, b) => b.active - a.active)
    .map((snap, i) => {
      const meta = tierMeta.get(snap.name);
      return {
        tier: snap.name,
        count: snap.active,
        lyCount: lyByTier.get(snap.name),
        price: meta ? Math.round(meta.priceCents / 100) : 0,
        colorToken: meta?.colorToken ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length],
      };
    });

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
