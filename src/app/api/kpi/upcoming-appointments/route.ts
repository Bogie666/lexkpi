/**
 * /api/kpi/upcoming-appointments — quick view of scheduled appointments
 * for the next 7 days, grouped by department → job type. Live-computed
 * from ST on each request (small dataset, a few hundred rows max).
 */
import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { businessUnits } from '@/db/schema';
import { collectResource } from '@/lib/sync/servicetitan/raw-client';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface StAppointment {
  id: number;
  jobId?: number | null;
  start?: string;
  status?: string;
  active?: boolean;
  unused?: boolean;
}

interface StJob {
  id: number;
  businessUnitId?: number | null;
  jobTypeId?: number | null;
}

interface StJobType {
  id: number;
  name?: string | null;
}

export interface UpcomingAppointmentsResponse {
  totalAppointments: number;
  todayCount: number;
  tomorrowCount: number;
  windowStart: string;
  windowEnd: string;
  /** Appointments per day across the 7-day window, each with a per-dept
   *  segment breakdown so the chart can render stacked bars. */
  byDay: Array<{
    date: string;
    count: number;
    depts: Array<{
      code: string | null;
      name: string;
      count: number;
    }>;
    topJobTypes: Array<{ name: string; count: number }>;
  }>;
  /** Top job types across all depts. */
  topJobTypes: Array<{ name: string; count: number }>;
  groups: Array<{
    departmentCode: string | null;
    departmentName: string | null;
    total: number;
    jobTypes: Array<{ name: string; count: number }>;
  }>;
}

function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function GET() {
  const today = new Date().toISOString().slice(0, 10);
  const windowEnd = shiftDate(today, 7);

  // 1. Pull appointments scheduled to start in the next 7 days.
  const appts = await collectResource<StAppointment>({
    path: '/jpm/v2/tenant/{tenant}/appointments',
    query: {
      startsOnOrAfter: `${today}T00:00:00Z`,
      startsBefore: `${windowEnd}T00:00:00Z`,
    },
  });

  // Filter to active, non-canceled appointments. ST emits a few lifecycle
  // states; we keep Scheduled/Dispatched/InProgress and drop Canceled/Done.
  const active = appts.filter((a) => {
    if (a.active === false || a.unused === true) return false;
    const status = (a.status ?? '').toLowerCase();
    return status !== 'canceled' && status !== 'done';
  });

  const jobIds = Array.from(
    new Set(active.map((a) => a.jobId).filter((id): id is number => id != null)),
  );
  if (jobIds.length === 0) {
    return NextResponse.json({
      data: {
        totalAppointments: 0,
        todayCount: 0,
        tomorrowCount: 0,
        windowStart: today,
        windowEnd,
        byDay: [],
        topJobTypes: [],
        groups: [],
      } satisfies UpcomingAppointmentsResponse,
    });
  }

  // 2. Pull job type dimension (small set, ~82 rows) and BU → dept map.
  const [types, database] = await Promise.all([
    collectResource<StJobType>({
      path: '/jpm/v2/tenant/{tenant}/job-types',
      query: {},
    }),
    Promise.resolve(db()),
  ]);
  const typeNames = new Map<number, string>();
  for (const t of types) {
    typeNames.set(t.id, (t.name ?? `type#${t.id}`).trim());
  }

  const buRows = await database
    .select({
      id: businessUnits.id,
      name: businessUnits.name,
      departmentCode: businessUnits.departmentCode,
    })
    .from(businessUnits);
  const buToDept = new Map<number, { code: string | null; name: string }>();
  for (const r of buRows) {
    buToDept.set(r.id, { code: r.departmentCode, name: r.name });
  }

  // 3. Pull just the jobs we need, in chunks. ST supports `ids` filter
  // on /jpm/v2/jobs; batch to keep URL length safe.
  const jobById = new Map<number, StJob>();
  const CHUNK = 50;
  for (let i = 0; i < jobIds.length; i += CHUNK) {
    const chunk = jobIds.slice(i, i + CHUNK);
    const page = await collectResource<StJob>({
      path: '/jpm/v2/tenant/{tenant}/jobs',
      query: { ids: chunk.join(',') },
      pageSize: Math.max(chunk.length + 10, 50),
    });
    for (const j of page) jobById.set(j.id, j);
  }

  // 4. Aggregate: dept → jobType → count, plus per-day and type totals.
  type DeptAgg = {
    departmentCode: string | null;
    departmentName: string | null;
    total: number;
    byType: Map<string, number>;
  };
  const byDept = new Map<string, DeptAgg>();
  // Per-day: total count, count by dept, count by job type.
  type DailyBreakdown = {
    total: number;
    depts: Map<string, { code: string | null; name: string; count: number }>;
    types: Map<string, number>;
  };
  const perDay = new Map<string, DailyBreakdown>();
  const typeTotals = new Map<string, number>();
  const tomorrow = shiftDate(today, 1);

  for (const a of active) {
    if (!a.jobId || !a.start) continue;
    const job = jobById.get(a.jobId);
    if (!job) continue;
    const bu = job.businessUnitId ? buToDept.get(job.businessUnitId) : null;
    const deptKey = bu?.code ?? '__uncategorized__';
    const deptName = bu?.name ?? 'Uncategorized';
    const typeName = job.jobTypeId
      ? typeNames.get(job.jobTypeId) ?? `type#${job.jobTypeId}`
      : 'Unknown type';

    const entry = byDept.get(deptKey) ?? {
      departmentCode: bu?.code ?? null,
      departmentName: deptName,
      total: 0,
      byType: new Map(),
    };
    entry.total += 1;
    entry.byType.set(typeName, (entry.byType.get(typeName) ?? 0) + 1);
    byDept.set(deptKey, entry);

    const day = a.start.slice(0, 10);
    const daily = perDay.get(day) ?? {
      total: 0,
      depts: new Map(),
      types: new Map(),
    };
    daily.total += 1;
    const dailyDept = daily.depts.get(deptKey) ?? {
      code: bu?.code ?? null,
      name: deptName,
      count: 0,
    };
    dailyDept.count += 1;
    daily.depts.set(deptKey, dailyDept);
    daily.types.set(typeName, (daily.types.get(typeName) ?? 0) + 1);
    perDay.set(day, daily);

    typeTotals.set(typeName, (typeTotals.get(typeName) ?? 0) + 1);
  }

  // Build a complete per-day list across the full 7-day window (including
  // zero days) so the chart renders consistently. Each day carries its
  // own dept + top-type segmentation.
  const byDayArr = Array.from({ length: 7 }, (_, i) => {
    const d = shiftDate(today, i);
    const daily = perDay.get(d);
    if (!daily) return { date: d, count: 0, depts: [], topJobTypes: [] };
    return {
      date: d,
      count: daily.total,
      depts: Array.from(daily.depts.values()).sort((a, b) => b.count - a.count),
      topJobTypes: Array.from(daily.types.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
    };
  });

  const groups = Array.from(byDept.values())
    .map((g) => ({
      departmentCode: g.departmentCode,
      departmentName: g.departmentName,
      total: g.total,
      jobTypes: Array.from(g.byType.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
    }))
    .sort((a, b) => b.total - a.total);

  const topJobTypes = Array.from(typeTotals.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const body: UpcomingAppointmentsResponse = {
    totalAppointments: active.length,
    todayCount: perDay.get(today)?.total ?? 0,
    tomorrowCount: perDay.get(tomorrow)?.total ?? 0,
    windowStart: today,
    windowEnd,
    byDay: byDayArr,
    topJobTypes,
    groups,
  };

  return NextResponse.json({ data: body });
}
