/**
 * Roster of every *currently active* technician — anyone whose
 * ServiceTitan technician record has active=true AND who appeared in
 * a role report within the last 45 days. Joined with the local
 * `employees` row for photo_url.
 *
 * Two filters because either alone has gaps:
 *   - ST active flag — authoritative, but a tech might be marked
 *     active in ST without ever appearing in a tech-KPI report.
 *   - 45-day period_end — covers techs who actually billed work
 *     recently, but ex-employees still in YTD/TTM windows pass.
 * Combined → just the techs you'd want to upload a photo for.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { and, eq, gte, sql } from 'drizzle-orm';
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

  // Pull every active employees row keyed by both ST id and normalized
  // name — we'll match by ST id first (precise), name second.
  const empRows = await database
    .select({
      serviceTitanId: employees.serviceTitanId,
      normalizedName: employees.normalizedName,
      photoUrl: employees.photoUrl,
      active: employees.active,
    })
    .from(employees)
    .where(eq(employees.active, true));
  const photoByStId = new Map<number, string | null>();
  const photoByNorm = new Map<string, string | null>();
  const activeStIds = new Set<number>();
  const activeNorms = new Set<string>();
  for (const e of empRows) {
    if (e.serviceTitanId != null) {
      activeStIds.add(e.serviceTitanId);
      photoByStId.set(e.serviceTitanId, e.photoUrl);
    }
    activeNorms.add(e.normalizedName);
    photoByNorm.set(e.normalizedName, e.photoUrl);
  }
  // Also pull every employees row (active or not) so we can flag
  // technicians ST has marked inactive — they're filtered out below.
  const allEmpRows = await database
    .select({
      serviceTitanId: employees.serviceTitanId,
      normalizedName: employees.normalizedName,
      active: employees.active,
    })
    .from(employees);
  const inactiveByStId = new Set<number>();
  const inactiveByNorm = new Set<string>();
  for (const e of allEmpRows) {
    if (e.active) continue;
    if (e.serviceTitanId != null) inactiveByStId.add(e.serviceTitanId);
    inactiveByNorm.add(e.normalizedName);
  }
  void and;

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
  let droppedInactive = 0;
  let droppedUnsynced = 0;
  for (const list of grouped.values()) {
    list.sort((a, b) => (a.latestEnd < b.latestEnd ? 1 : -1));
    const r = list[0];
    const norm = normalize(r.employeeName);
    const stId = Number(r.employeeId);

    // Drop techs ST has marked inactive (matched by ST id first, then name).
    if (inactiveByStId.has(stId) || inactiveByNorm.has(norm)) {
      droppedInactive += 1;
      continue;
    }
    // If we have a synced employees roster and this tech isn't on it
    // (neither by ST id nor by name), drop them — they're either an ex
    // employee whose last tech-KPI window is still in our 45-day cutoff,
    // or someone who hasn't been imported yet. Skipping unsynced
    // entries until the sync has run is fine; otherwise we'd surface
    // the whole pre-filter list.
    const synced = empRows.length > 0;
    if (synced && !activeStIds.has(stId) && !activeNorms.has(norm)) {
      droppedUnsynced += 1;
      continue;
    }

    const photo = photoByStId.get(stId) ?? photoByNorm.get(norm) ?? null;
    roster.push({
      employeeId: stId,
      name: r.employeeName,
      normalizedName: norm,
      roleCode: r.roleCode,
      photoUrl: photo,
    });
  }

  roster.sort((a, b) => a.name.localeCompare(b.name));
  return NextResponse.json({
    ok: true,
    cutoffFrom: cutoff,
    droppedInactive,
    droppedUnsynced,
    roster,
  });
}
