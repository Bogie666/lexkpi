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
import { drizzle } from 'drizzle-orm/neon-http';
import { migrate } from 'drizzle-orm/neon-http/migrator';
import path from 'node:path';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const query = req.nextUrl.searchParams.get('secret');
  return bearer === secret || query === secret;
}

async function runMigrations(): Promise<{ ok: true }> {
  const url =
    process.env.DATABASE_URL_UNPOOLED ??
    process.env.POSTGRES_URL_NON_POOLING ??
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  const sql = neon(url);
  const database = drizzle(sql);
  await migrate(database, { migrationsFolder: path.join(process.cwd(), 'drizzle') });
  return { ok: true };
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
  const mode = req.nextUrl.searchParams.get('mode') ?? 'migrate-and-seed';
  const out: Record<string, unknown> = { mode };
  try {
    if (mode === 'migrate' || mode === 'migrate-and-seed') {
      out.migrate = await runMigrations();
    }
    if (mode === 'seed' || mode === 'migrate-and-seed') {
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
