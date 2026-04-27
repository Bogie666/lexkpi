/**
 * Roster of every *currently active* technician — anyone who appeared
 * in a recent (≤45 day) period across any role report — joined with
 * their `employees` record for photo_url. Used by /admin/photos to
 * show a picker even before an employees dim row has been created.
 *
 * The 45-day cutoff excludes ex-employees that only show up in the
 * historical LY / LY2 windows. It also picks up techs on a brief
 * vacation — anyone who worked at all in the trailing month and a
 * half is included.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { gte, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { employees, technicianPeriod } from '@/db/schema';

export const dynamic = 'force-dynamic';

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const query = req.nextUrl.searchParams.get('secret');
  return bearer === secret || query === secret;
}

function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

interface RosterEntry {
  employeeId: number;
  name: string;
  normalizedName: string;
  roleCode: string;
  photoUrl: string | null;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const database = db();

  // Cutoff for "active" — only show techs whose latest period_end is
  // within the last 45 days. The dashboard's MTD windows have
  // period_end = today, so currently-working techs always pass.
  const cutoffDate = new Date(Date.now() - 45 * 86_400_000);
  const cutoff = cutoffDate.toISOString().slice(0, 10);

  // Distinct techs by (employee, role) where they have at least one
  // recent period. SQL groups + filters before the JS layer.
  const rows = await database
    .select({
      employeeId: technicianPeriod.employeeId,
      employeeName: technicianPeriod.employeeName,
      roleCode: technicianPeriod.roleCode,
      latestEnd: sql<string>`MAX(${technicianPeriod.periodEnd})`,
    })
    .from(technicianPeriod)
    .where(gte(technicianPeriod.periodEnd, cutoff))
    .groupBy(technicianPeriod.employeeId, technicianPeriod.employeeName, technicianPeriod.roleCode);

  // Pull every employees row once and key by normalized name.
  const empRows = await database
    .select({
      normalizedName: employees.normalizedName,
      photoUrl: employees.photoUrl,
    })
    .from(employees);
  const photoByNorm = new Map(empRows.map((e) => [e.normalizedName, e.photoUrl]));

  // If a tech has multiple roles, surface the one whose latest period
  // is most recent. Sort within (employee, name) by latestEnd DESC and
  // dedupe.
  const grouped = new Map<string, typeof rows>();
  for (const r of rows) {
    const norm = normalize(r.employeeName);
    const key = `${r.employeeId}|${norm}`;
    const list = grouped.get(key) ?? [];
    list.push(r);
    grouped.set(key, list);
  }

  const roster: RosterEntry[] = [];
  for (const list of grouped.values()) {
    list.sort((a, b) => (a.latestEnd < b.latestEnd ? 1 : -1));
    const r = list[0];
    const norm = normalize(r.employeeName);
    roster.push({
      employeeId: Number(r.employeeId),
      name: r.employeeName,
      normalizedName: norm,
      roleCode: r.roleCode,
      photoUrl: photoByNorm.get(norm) ?? null,
    });
  }

  roster.sort((a, b) => a.name.localeCompare(b.name));
  return NextResponse.json({
    ok: true,
    cutoffFrom: cutoff,
    roster,
  });
}
