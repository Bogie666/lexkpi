/**
 * One-shot schema + seed endpoint. Runs Drizzle migrations against the
 * committed SQL files in /drizzle, then (if requested) executes the seed
 * script contents server-side. Lets us bootstrap a fresh Neon DB without
 * needing local access to DATABASE_URL.
 *
 *   POST /api/admin/db-setup?mode=migrate          — migrate only
 *   POST /api/admin/db-setup?mode=seed             — seed only
 *   POST /api/admin/db-setup?mode=migrate-and-seed — both (default)
 *
 * Gated by CRON_SECRET.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const query = req.nextUrl.searchParams.get('secret');
  return bearer === secret || query === secret;
}

/**
 * Idempotent DDL that brings a partially-initialized DB up to the current
 * schema. Runs `CREATE TABLE IF NOT EXISTS` plus any missing indexes for
 * tables introduced after the first `db:push`. For a clean DB, use
 * drizzle-kit push locally; this path exists to patch production when we
 * can't reach it from a shell.
 */
async function runSchema(): Promise<{ tablesEnsured: string[]; columnsEnsured: string[] }> {
  const url =
    process.env.DATABASE_URL_UNPOOLED ??
    process.env.POSTGRES_URL_NON_POOLING ??
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  const sql = neon(url);

  // business_units was added after the initial push. Create it idempotently.
  await sql`
    CREATE TABLE IF NOT EXISTS business_units (
      id integer PRIMARY KEY NOT NULL,
      name text NOT NULL,
      department_code text,
      active boolean DEFAULT true NOT NULL,
      created_at timestamp DEFAULT now() NOT NULL,
      updated_at timestamp DEFAULT now() NOT NULL
    )
  `;

  // closed_opportunities column added for the Jobs sync.
  await sql`
    ALTER TABLE financial_daily
    ADD COLUMN IF NOT EXISTS closed_opportunities integer NOT NULL DEFAULT 0
  `;

  // job_id column added to estimate_analysis for the Estimates sync.
  // Needed so we can group good/better/best estimates left on the same job
  // and average them (instead of summing triple-counted pipeline).
  await sql`
    ALTER TABLE estimate_analysis
    ADD COLUMN IF NOT EXISTS job_id bigint
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS ea_job_idx ON estimate_analysis (job_id)
  `;

  // avg_call_time_sec added to call_center_daily — the Call Center page
  // now shows "Avg Call Time" in place of "Avg Wait".
  await sql`
    ALTER TABLE call_center_daily
    ADD COLUMN IF NOT EXISTS avg_call_time_sec integer
  `;

  // All technician role leaderboards sort by closed revenue. HVAC Tech
  // and Maint. originally seeded with avgTicket/jobs; patch them.
  await sql`
    UPDATE technician_roles
    SET primary_metric = 'revenue',
        primary_metric_label = 'Closed revenue',
        updated_at = now()
    WHERE code IN ('hvac_tech', 'hvac_maintenance')
      AND primary_metric <> 'revenue'
  `;

  // technician_period — aggregated from ST's role-specific Tech KPI
  // reports. Not daily; one row per (role, period, tech).
  await sql`
    CREATE TABLE IF NOT EXISTS technician_period (
      id serial PRIMARY KEY,
      role_code text NOT NULL,
      period_start date NOT NULL,
      period_end date NOT NULL,
      employee_id bigint NOT NULL,
      employee_name text NOT NULL,
      completed_jobs integer NOT NULL DEFAULT 0,
      completed_revenue_cents bigint NOT NULL DEFAULT 0,
      opportunity integer NOT NULL DEFAULT 0,
      sales_opportunity integer NOT NULL DEFAULT 0,
      closed_opportunities integer NOT NULL DEFAULT 0,
      close_rate_bps integer,
      total_sales_cents bigint NOT NULL DEFAULT 0,
      options_per_opportunity_x100 integer,
      memberships_sold integer NOT NULL DEFAULT 0,
      leads_set integer NOT NULL DEFAULT 0,
      total_lead_sales_cents bigint NOT NULL DEFAULT 0,
      technician_business_unit text,
      technician_trade text,
      source_report_id text NOT NULL,
      synced_at timestamp DEFAULT now() NOT NULL
    )
  `;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS tech_period_uniq
      ON technician_period (role_code, period_start, period_end, employee_id)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS tech_period_role_idx
      ON technician_period (role_code)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS tech_period_period_idx
      ON technician_period (period_start, period_end)
  `;

  return {
    tablesEnsured: ['business_units', 'technician_period'],
    columnsEnsured: [
      'financial_daily.closed_opportunities',
      'estimate_analysis.job_id',
      'call_center_daily.avg_call_time_sec',
    ],
  };
}

/**
 * One-shot migration to promote ETX from "dropped" to a real dashboard
 * department. Inserts the etx dept row (idempotent) and flips the 5 ETX
 * business units from department_code=NULL to 'etx'. Safe to re-run.
 */
async function addEtx(): Promise<{
  departmentUpserted: number;
  businessUnitsUpdated: number;
}> {
  const url =
    process.env.DATABASE_URL_UNPOOLED ??
    process.env.POSTGRES_URL_NON_POOLING ??
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  const sql = neon(url);

  const deptRows = await sql`
    INSERT INTO departments (code, name, color_token, sort_order, active)
    VALUES ('etx', 'ETX', '--d-etx', 70, true)
    ON CONFLICT (code) DO UPDATE SET
      name         = excluded.name,
      color_token  = excluded.color_token,
      sort_order   = excluded.sort_order,
      active       = excluded.active,
      updated_at   = now()
    RETURNING id
  `;

  const buRows = await sql`
    UPDATE business_units
    SET department_code = 'etx',
        updated_at      = now()
    WHERE id IN (154681094, 154681497, 154684495, 154687321, 154691820)
    RETURNING id
  `;

  return {
    departmentUpserted: deptRows.length,
    businessUnitsUpdated: buRows.length,
  };
}

async function runSeed() {
  // The seed script uses top-level await for dotenv etc.; we can't import
  // it directly as a module in a route without side-effects. Safer: inline
  // the minimum — call buildSeed() helpers and execute here.
  // For now, delegate to the extracted seed runner (see src/db/seed/run.ts).
  const { runSeed: runSeedFn } = await import('@/db/seed/run');
  return runSeedFn();
}

async function handle(req: NextRequest): Promise<NextResponse> {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const mode = req.nextUrl.searchParams.get('mode') ?? 'schema-and-seed';
  const out: Record<string, unknown> = { mode };
  try {
    if (mode === 'schema' || mode === 'migrate' || mode === 'schema-and-seed' || mode === 'migrate-and-seed') {
      out.schema = await runSchema();
    }
    if (mode === 'add-etx') {
      out.etx = await addEtx();
    }
    if (mode === 'seed' || mode === 'schema-and-seed' || mode === 'migrate-and-seed') {
      out.seed = await runSeed();
    }
    return NextResponse.json({ ok: true, ...out });
  } catch (err) {
    return NextResponse.json(
      { ok: false, mode, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export const POST = handle;
export const GET = handle;
