import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

/**
 * Lazy-initialized Drizzle client over Neon's serverless HTTP driver.
 *
 * Neon-HTTP is cold-start friendly (no long-lived connection pool) and fast
 * enough for the ~15 queries per dashboard request. For scripts that need
 * a session (`BEGIN`, advisory locks, etc.) import neon-ws instead.
 *
 * The client is lazy so that route files can be imported during `next build`
 * without DATABASE_URL being set — only runtime queries actually reach Neon.
 */
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function db() {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. In Vercel this is wired automatically by the Neon integration. Locally, run `vercel env pull .env.local` in the repo root.',
    );
  }
  const sql = neon(url);
  _db = drizzle(sql, { schema });
  return _db;
}
