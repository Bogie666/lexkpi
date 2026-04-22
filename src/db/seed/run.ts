/**
 * Importable seed runner. No top-level side effects — callers construct their
 * own DB client and pass credentials explicitly (via env at call time).
 *
 * Used by:
 *   - src/db/seed/index.ts   — CLI entry, runs directly via `tsx`
 *   - /api/admin/db-setup    — remote trigger when we can't run scripts locally
 */
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { sql } from 'drizzle-orm';

import * as schema from '../schema';
import {
  DEPARTMENTS,
  ROLES,
  TECHNICIANS,
  CALL_AGENTS,
  CALL_HOURLY,
  MEMBERSHIP_TIERS,
  MEMBERSHIP_HISTORY,
  MEMBERSHIP_LY_HISTORY,
  BUSINESS_UNITS,
} from './data';
import { buildEstimateRows } from './estimates';

const DOLLAR = (n: number) => Math.round(n * 100);
const PCT_TO_BPS = (n: number) => Math.round(n * 100);

function aprDays(year: number): string[] {
  return Array.from({ length: 20 }, (_, i) => `${year}-04-${String(i + 1).padStart(2, '0')}`);
}

function distributeByWeights(totalCents: number, weights: number[]): number[] {
  const sumW = weights.reduce((a, b) => a + b, 0) || 1;
  const out = weights.map((w) => Math.floor((w / sumW) * totalCents));
  const drift = totalCents - out.reduce((a, b) => a + b, 0);
  out[out.length - 1] += drift;
  return out;
}

function distributeIntEven(total: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(total / n);
  const rem = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
}

export interface SeedReport {
  departments: number;
  technicianRoles: number;
  membershipTiers: number;
  businessUnits: number;
  employees: number;
  financialDaily: number;
  technicianDaily: number;
  callCenterDaily: number;
  callCenterHourly: number;
  membershipDaily: number;
  targets: number;
  estimateAnalysis: number;
}

export async function runSeed(log: (msg: string) => void = console.log): Promise<SeedReport> {
  const url =
    process.env.DATABASE_URL_UNPOOLED ??
    process.env.POSTGRES_URL_NON_POOLING ??
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL;
  if (!url) {
    throw new Error('DATABASE_URL not set.');
  }
  const client = neon(url);
  const db = drizzle(client, { schema });

  log('• Wiping working tables…');
  await db.execute(sql`TRUNCATE TABLE
    ${schema.technicianDaily},
    ${schema.financialDaily},
    ${schema.callCenterDaily},
    ${schema.callCenterHourly},
    ${schema.membershipDaily},
    ${schema.estimateAnalysis},
    ${schema.employees},
    ${schema.technicianRoles},
    ${schema.membershipTiers},
    ${schema.businessUnits},
    ${schema.departments},
    ${schema.targets}
    RESTART IDENTITY CASCADE`);

  log('• Seeding departments…');
  await db.insert(schema.departments).values(
    DEPARTMENTS.map((d) => ({
      code: d.code,
      name: d.name,
      colorToken: d.colorToken,
      sortOrder: d.sortOrder,
    })),
  );

  log('• Seeding technician_roles…');
  await db.insert(schema.technicianRoles).values(
    ROLES.map((r) => ({
      code: r.code,
      name: r.name,
      primaryMetric: r.primaryMetric,
      primaryMetricLabel: r.primaryMetricLabel,
      sortOrder: r.sortOrder,
    })),
  );

  log('• Seeding membership_tiers…');
  await db.insert(schema.membershipTiers).values(
    MEMBERSHIP_TIERS.map((t) => ({
      name: t.name,
      priceCents: t.price * 100,
      colorToken: t.colorToken,
      sortOrder: t.sortOrder,
    })),
  );

  log('• Seeding business_units…');
  await db.insert(schema.businessUnits).values(
    BUSINESS_UNITS.map((b) => ({
      id: b.id,
      name: b.name,
      departmentCode: b.departmentCode,
    })),
  );

  log('• Seeding employees…');
  await db.insert(schema.employees).values(
    TECHNICIANS.map((t) => ({
      name: t.name,
      normalizedName: t.name.toLowerCase().trim(),
      roleCode: t.role,
      departmentCode: t.dept,
    })),
  );

  log('• Seeding financial_daily (current + LY + LY2)…');
  const finRows: (typeof schema.financialDaily.$inferInsert)[] = [];
  const years: Array<{
    year: number;
    key: 'cur' | 'ly' | 'ly2';
    weights: (d: (typeof DEPARTMENTS)[number]) => number[];
  }> = [
    { year: 2026, key: 'cur', weights: (d) => d.spark },
    { year: 2025, key: 'ly', weights: (d) => d.lySpark },
    { year: 2024, key: 'ly2', weights: (d) => d.ly2Spark ?? d.lySpark.map((v) => Math.round(v * 0.9)) },
  ];
  for (const { year, key, weights } of years) {
    const days = aprDays(year);
    for (const d of DEPARTMENTS) {
      const totalCents = DOLLAR(d.revenue[key]);
      const perDay = distributeByWeights(totalCents, weights(d));
      const jobsPerDay = distributeIntEven(d.jobs, 20);
      const oppsPerDay = distributeIntEven(d.opportunities, 20);
      for (let i = 0; i < days.length; i++) {
        finRows.push({
          departmentCode: d.code,
          reportDate: days[i],
          totalRevenueCents: perDay[i],
          jobs: key === 'cur' ? jobsPerDay[i] : Math.max(1, Math.round(jobsPerDay[i] * 0.92)),
          opportunities:
            key === 'cur' ? oppsPerDay[i] : Math.max(1, Math.round(oppsPerDay[i] * 0.92)),
          sourceReportId: 'seed',
        });
      }
    }
  }
  await db.insert(schema.financialDaily).values(finRows);

  log('• Seeding technician_daily (current + LY + LY2)…');
  const techEmployees = await db.select().from(schema.employees);
  const byName = new Map(techEmployees.map((e) => [e.name, e]));

  const techRows: (typeof schema.technicianDaily.$inferInsert)[] = [];
  for (const t of TECHNICIANS) {
    const emp = byName.get(t.name);
    if (!emp) continue;
    for (const { year, key } of years) {
      const days = aprDays(year);
      const totalCents = DOLLAR(key === 'cur' ? t.revenue : t.lyRevenue);
      const totalJobs = key === 'cur' ? t.jobs : t.lyJobs;
      const spark = t.recentSpark;
      const firstHalfShare = distributeIntEven(1, 10).map(() => 1);
      const weights = [...firstHalfShare, ...spark];
      const perDay = distributeByWeights(totalCents, weights);
      const jobsPerDay = distributeIntEven(totalJobs, 20);
      for (let i = 0; i < days.length; i++) {
        techRows.push({
          employeeId: emp.id,
          employeeName: emp.name,
          roleCode: t.role,
          departmentCode: t.dept,
          reportDate: days[i],
          revenueCents: perDay[i],
          jobsCompleted: jobsPerDay[i],
          closeRateBps: PCT_TO_BPS(key === 'cur' ? t.closeRate : t.lyCloseRate),
          avgTicketCents: DOLLAR(key === 'cur' ? t.avgTicket : t.lyAvgTicket),
          memberships:
            key === 'cur'
              ? Math.round(t.memberships / 20)
              : Math.round((t.memberships * 0.9) / 20),
          opportunities: Math.round(totalJobs / 0.5 / 20),
          sourceReportId: 'seed',
        });
      }
    }
  }
  await db.insert(schema.technicianDaily).values(techRows);

  log('• Seeding call_center_daily (today)…');
  const today = '2026-04-21';
  await db.insert(schema.callCenterDaily).values(
    CALL_AGENTS.map((a) => ({
      employeeName: a.name,
      reportDate: today,
      totalCalls: a.calls,
      callsBooked: a.booked,
      bookingRateBps: PCT_TO_BPS(a.ratePct),
      avgWaitSec: 24,
      abandonRateBps: PCT_TO_BPS(3.2),
      sourceReportId: 'seed',
    })),
  );

  log('• Seeding call_center_hourly (today + LY)…');
  await db.insert(schema.callCenterHourly).values([
    ...CALL_HOURLY.map((h) => ({
      reportDate: today,
      hour: h.hr,
      totalCalls: h.calls,
      callsBooked: h.booked,
    })),
    ...CALL_HOURLY.map((h) => ({
      reportDate: '2025-04-21',
      hour: h.hr,
      totalCalls: Math.max(1, Math.round(h.calls * 0.85)),
      callsBooked: Math.max(1, Math.round(h.booked * 0.75)),
    })),
  ]);

  log('• Seeding membership_daily (monthly snapshots)…');
  const lastDayOfMonth = (y: number, m: number) =>
    new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);

  const memRows: (typeof schema.membershipDaily.$inferInsert)[] = [];
  const monthSeq: Array<{ y: number; m: number; idx: number }> = [];
  for (let i = 0; i < 12; i++) {
    const y = 2025 + Math.floor((4 + i) / 12);
    const m = ((4 + i) % 12) + 1;
    monthSeq.push({ y, m, idx: i });
  }
  const tierTotalCur = MEMBERSHIP_TIERS.reduce((s, t) => s + t.cur, 0) || 1;
  const tierTotalLy = MEMBERSHIP_TIERS.reduce((s, t) => s + t.ly, 0) || 1;
  for (const tier of MEMBERSHIP_TIERS) {
    const share = tier.cur / tierTotalCur;
    const lyShare = tier.ly / tierTotalLy;
    for (const { y, m, idx } of monthSeq) {
      const totalForMonth = MEMBERSHIP_HISTORY[idx];
      memRows.push({
        membershipName: tier.name,
        reportDate: lastDayOfMonth(y, m),
        activeEnd: Math.round(totalForMonth * share),
        newSales: Math.round(216 * share),
        canceled: Math.round(72 * share),
        netChange: Math.round(144 * share),
        priceCents: tier.price * 100,
        sourceReportId: 'seed',
      });
    }
    for (let i = 0; i < 12; i++) {
      const y = 2024 + Math.floor((4 + i) / 12);
      const m = ((4 + i) % 12) + 1;
      const totalForMonth = MEMBERSHIP_LY_HISTORY[i];
      memRows.push({
        membershipName: tier.name,
        reportDate: lastDayOfMonth(y, m),
        activeEnd: Math.round(totalForMonth * lyShare),
        newSales: Math.round(184 * lyShare),
        canceled: Math.round(68 * lyShare),
        netChange: Math.round(116 * lyShare),
        priceCents: tier.price * 100,
        sourceReportId: 'seed',
      });
    }
  }
  await db.insert(schema.membershipDaily).values(memRows);

  log('• Seeding targets (April 2026 per-dept revenue)…');
  await db.insert(schema.targets).values(
    DEPARTMENTS.map((d) => ({
      metric: 'revenue',
      scope: 'department' as const,
      scopeValue: d.code,
      effectiveFrom: '2026-04-01',
      effectiveTo: '2026-04-30',
      targetValue: DOLLAR(d.monthlyTargetDollars),
      unit: 'cents',
      notes: 'April 2026 monthly target (seed)',
    })),
  );
  // Company-wide April target — set explicitly by the team, not derived from
  // the per-dept sum. Leave this as the source of truth when reseeding.
  await db.insert(schema.targets).values({
    metric: 'revenue',
    scope: 'company',
    scopeValue: null,
    effectiveFrom: '2026-04-01',
    effectiveTo: '2026-04-30',
    targetValue: DOLLAR(2_180_000),
    unit: 'cents',
    notes: 'April 2026 company revenue target',
  });

  log('• Seeding estimate_analysis…');
  const estRows = buildEstimateRows();
  const CHUNK = 1000;
  for (let i = 0; i < estRows.length; i += CHUNK) {
    await db.insert(schema.estimateAnalysis).values(estRows.slice(i, i + CHUNK));
  }

  const report: SeedReport = {
    departments: DEPARTMENTS.length,
    technicianRoles: ROLES.length,
    membershipTiers: MEMBERSHIP_TIERS.length,
    businessUnits: BUSINESS_UNITS.length,
    employees: TECHNICIANS.length,
    financialDaily: finRows.length,
    technicianDaily: techRows.length,
    callCenterDaily: CALL_AGENTS.length,
    callCenterHourly: CALL_HOURLY.length * 2,
    membershipDaily: memRows.length,
    targets: DEPARTMENTS.length + 1,
    estimateAnalysis: estRows.length,
  };

  log(
    `✓ Seed complete. fin=${report.financialDaily} tech=${report.technicianDaily} mem=${report.membershipDaily} est=${report.estimateAnalysis}`,
  );
  return report;
}
