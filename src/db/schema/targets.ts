import { pgTable, serial, text, date, bigint, timestamp, index } from 'drizzle-orm/pg-core';

/**
 * Period-flexible target model. A single row represents one target
 * (metric × scope × time window). Replaces the old monthly-keyed table.
 *
 * Examples:
 *   - Q2 HVAC revenue target → metric='revenue', scope='department',
 *     scope_value='hvac', effective_from='2026-04-01', effective_to='2026-06-30'
 *   - Annual close rate target → metric='close_rate', scope='company',
 *     scope_value=null, effective_from='2026-01-01', effective_to='2026-12-31'
 */
export const targets = pgTable(
  'targets',
  {
    id: serial('id').primaryKey(),
    metric: text('metric').notNull(),
    scope: text('scope').notNull(),
    scopeValue: text('scope_value'),
    effectiveFrom: date('effective_from').notNull(),
    effectiveTo: date('effective_to').notNull(),
    targetValue: bigint('target_value', { mode: 'number' }).notNull(),
    unit: text('unit').notNull(),
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    lookup: index('targets_lookup').on(t.metric, t.scope, t.scopeValue, t.effectiveFrom),
  }),
);
