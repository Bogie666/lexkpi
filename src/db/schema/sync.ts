import { pgTable, serial, text, date, integer, timestamp, index } from 'drizzle-orm/pg-core';

/**
 * Sync-run log — one row per sync attempt, per source. Every sync writes a
 * terminal row (success | error). Admin sync-health UI reads this.
 */
export const syncRuns = pgTable(
  'sync_runs',
  {
    id: serial('id').primaryKey(),
    source: text('source').notNull(), // 'st_financial', 'st_comfort_advisor', 'google_reviews', ...
    trigger: text('trigger').notNull(), // 'cron' | 'manual' | 'backfill'
    reportId: text('report_id'),
    windowStart: date('window_start').notNull(),
    windowEnd: date('window_end').notNull(),
    status: text('status').notNull(), // 'running' | 'success' | 'error'
    rowsFetched: integer('rows_fetched'),
    rowsUpserted: integer('rows_upserted'),
    errorMessage: text('error_message'),
    startedAt: timestamp('started_at').defaultNow().notNull(),
    finishedAt: timestamp('finished_at'),
  },
  (t) => ({
    sourceStartedIdx: index('sync_runs_source_started_idx').on(t.source, t.startedAt),
    statusIdx: index('sync_runs_status_idx').on(t.status),
  }),
);
