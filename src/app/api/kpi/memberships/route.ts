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

  // 12-month history — latest active_end per (month, tier), then sum
  // across tiers. Avoids double-counting when multiple daily-sync rows
  // exist within the same month (e.g., today's + yesterday's snapshot).
  const historyRows = await database
    .select()
    .from(membershipDaily)
    .where(and(lte(membershipDaily.reportDate, period.cur.to)));

  const byMonthTier = new Map<string, Map<string, { date: string; active: number }>>();
  for (const r of historyRows) {
    const key = r.reportDate.slice(0, 7);
    if (!byMonthTier.has(key)) byMonthTier.set(key, new Map());
    const tierMap = byMonthTier.get(key)!;
    const prior = tierMap.get(r.membershipName);
    if (!prior || r.reportDate > prior.date) {
      tierMap.set(r.membershipName, {
        date: r.reportDate,
        active: Number(r.activeEnd),
      });
    }
  }
  const byMonth = new Map<string, number>();
  for (const [month, tiers] of byMonthTier) {
    let total = 0;
    for (const v of tiers.values()) total += v.active;
    byMonth.set(month, total);
  }
  const history = monthKeysBefore(period.cur.to, 12).map((k) => byMonth.get(k) ?? 0);
  const lyHistory = monthKeysBefore(period.ly.to, 12).map((k) => byMonth.get(k) ?? 0);

  // Bucket raw ST type names into the dashboard's 5 categories. Keeps the UI
  // usable when ST has ~14 granular types (Lex/Lyons/ETX × 1/2-3/4-5/6+).
  // Pricing from lexairconditioning.com/cool-club. Complimentary is free.
  const BUCKETS = [
    { key: '1 System',       color: '--d-hvac_service',     price: 14 },
    { key: '2-3 Systems',    color: '--d-hvac_sales',       price: 24 },
    { key: '4-5 Systems',    color: '--d-plumbing',         price: 44 },
    { key: '6+ Systems',     color: '--d-commercial',       price: 64 },
    { key: 'Complimentary',  color: '--d-hvac_maintenance', price: 0  },
    { key: 'Other',          color: '--d-electrical',       price: 0  },
  ] as const;
  type BucketKey = (typeof BUCKETS)[number]['key'];

  function bucketOf(rawName: string): BucketKey {
    const n = rawName.toLowerCase();
    if (n.includes('complimentary') || n.includes('free')) return 'Complimentary';
    if (/\b1\s*system\b/.test(n)) return '1 System';
    if (/\b2[-–]3\s*systems?\b/.test(n)) return '2-3 Systems';
    if (/\b4[-–]5\s*systems?\b/.test(n)) return '4-5 Systems';
    if (/\b6\+?\s*systems?\b/.test(n)) return '6+ Systems';
    return 'Other';
  }

  const perBucketCur = new Map<BucketKey, number>();
  const perBucketLy = new Map<BucketKey, number>();
  for (const snap of curSnap) {
    const k = bucketOf(snap.name);
    perBucketCur.set(k, (perBucketCur.get(k) ?? 0) + snap.active);
  }
  for (const snap of lySnap) {
    const k = bucketOf(snap.name);
    perBucketLy.set(k, (perBucketLy.get(k) ?? 0) + snap.active);
  }

  const breakdown = BUCKETS
    .map(({ key, color, price }) => ({
      tier: key,
      count: perBucketCur.get(key) ?? 0,
      lyCount: perBucketLy.has(key) ? perBucketLy.get(key) : undefined,
      price,
      colorToken: color,
    }))
    // Hide buckets with no members to keep the panel clean.
    .filter((row) => row.count > 0);
  // Suppress unused — the dimension table is kept for future price lookup.
  void tiers;

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
