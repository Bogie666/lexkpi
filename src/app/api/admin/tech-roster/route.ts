/**
 * Roster of every technician who appeared in the latest period of any
 * role report, joined with their `employees` record (if one exists)
 * for photo_url. Used by /admin/photos to show a picker even before
 * an employee dim row has been created.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
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

  // Distinct techs across all role periods, picking the latest seen for
  // each (role, employee_id) so duplicates don't appear once a tech moves
  // role or window.
  const rows = await database
    .select({
      employeeId: technicianPeriod.employeeId,
      employeeName: technicianPeriod.employeeName,
      roleCode: technicianPeriod.roleCode,
      periodEnd: sql<string>`MAX(${technicianPeriod.periodEnd})`,
    })
    .from(technicianPeriod)
    .groupBy(technicianPeriod.employeeId, technicianPeriod.employeeName, technicianPeriod.roleCode);

  // Pull every employees row once and key by normalized name.
  const empRows = await database
    .select({
      normalizedName: employees.normalizedName,
      photoUrl: employees.photoUrl,
    })
    .from(employees);
  const photoByNorm = new Map(empRows.map((e) => [e.normalizedName, e.photoUrl]));

  const seen = new Set<string>();
  const roster: RosterEntry[] = [];
  for (const r of rows) {
    const norm = normalize(r.employeeName);
    // Don't surface a tech twice across roles — show them under their
    // most-recent role only.
    const key = `${r.employeeId}|${norm}`;
    if (seen.has(key)) continue;
    seen.add(key);
    roster.push({
      employeeId: Number(r.employeeId),
      name: r.employeeName,
      normalizedName: norm,
      roleCode: r.roleCode,
      photoUrl: photoByNorm.get(norm) ?? null,
    });
  }

  roster.sort((a, b) => a.name.localeCompare(b.name));
  return NextResponse.json({ ok: true, roster });
}
