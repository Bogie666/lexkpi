# Lex KPI Dashboard — Data Spec

**Audience:** Engineer (or agent) building the backend. This spec covers schema, sync worker, and API contracts. Everything needed to implement the data layer without further decisions.

**Companion docs:** `ARCHITECTURE-SPEC.md` (the why) · `UI-SPEC.md` (frontend, forthcoming).

---

## Table of contents

1. [Stack decisions](#1-stack-decisions)
2. [Schema — full Drizzle definitions](#2-schema)
3. [Source report → table mapping](#3-source-mapping)
4. [Sync worker architecture](#4-sync-worker)
5. [Backfill strategy](#5-backfill)
6. [API contracts](#6-api-contracts)
7. [Caching layer](#7-caching)
8. [File structure](#8-file-structure)
9. [Environment variables](#9-env)
10. [Acceptance criteria](#10-acceptance)

---

## 1. Stack decisions

| Concern | Choice | Notes |
|---|---|---|
| Runtime | Node.js 20+ (TypeScript) | LTS, Vercel-supported |
| Framework | Next.js 15 App Router | Route Handlers for APIs |
| ORM | Drizzle | Typed schema, explicit SQL, fast |
| DB | Neon Postgres | Serverless, branching for previews |
| Validation | Zod | Request/response validation |
| HTTP client | native `fetch` | No axios, keeps bundle small |
| Cron | Vercel Cron | Triggered by `/api/sync/tick` |
| Secrets | Vercel env vars | Encrypted at rest |
| Date math | `date-fns-tz` | Timezone-aware, immutable |
| Logging | `pino` | JSON logs, Vercel log drains |

**One explicit non-choice:** no Redis, no external cache. Next.js route-level cache + Postgres query cache is enough at this scale. Add Redis only if monitoring shows it's needed.

---

## 2. Schema

All tables use `created_at` / `updated_at` timestamps with `update_updated_at_column()` trigger pattern. All money stored as `bigint` cents. All percentages stored as `integer` basis points (0–10000 = 0.00–100.00%). All dates are `date` type (not `timestamp`) for day-grain facts; timestamps are reserved for event logs.

### 2.1 Dimension tables

These rarely change and power dropdowns, role selectors, etc.

```ts
// src/db/schema/dimensions.ts

import { pgTable, serial, text, boolean, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

// Consolidated departments (maps from ~26 ST business units to 8 depts)
export const departments = pgTable('departments', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),        // 'hvac_service', 'hvac_replacement', etc.
  name: text('name').notNull(),                 // 'HVAC Service'
  colorToken: text('color_token').notNull(),    // '--d-hvac', '--d-plumbing', etc.
  sortOrder: integer('sort_order').notNull().default(0),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Tech roles — powers the Technicians tab sub-tabs
export const technicianRoles = pgTable('technician_roles', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),        // 'hvac_tech', 'comfort_advisor', etc.
  name: text('name').notNull(),                 // 'HVAC Tech'
  primaryMetric: text('primary_metric').notNull(),  // 'revenue' | 'avgTicket' | 'jobs'
  sortOrder: integer('sort_order').notNull().default(0),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Maps raw ST business unit strings to internal department codes
export const businessUnitMap = pgTable('business_unit_map', {
  id: serial('id').primaryKey(),
  stBusinessUnit: text('st_business_unit').notNull().unique(),  // 'Lex HVAC Service'
  departmentCode: text('department_code').notNull().references(() => departments.code),
  ignore: boolean('ignore').notNull().default(false),           // for deprecated units
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Employees — canonical roster, synced from ST
export const employees = pgTable('employees', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  normalizedName: text('normalized_name').notNull(),  // lowercase, trimmed, for joins
  roleCode: text('role_code').references(() => technicianRoles.code),
  departmentCode: text('department_code').references(() => departments.code),
  active: boolean('active').notNull().default(true),
  photoUrl: text('photo_url'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  nameUniq: uniqueIndex('employees_name_uniq').on(t.normalizedName),
}));
```

### 2.2 Fact tables — daily grain

**The architectural core.** One row per entity per day. Never deleted. Period aggregation happens at query time.

```ts
// src/db/schema/facts.ts

import { pgTable, serial, text, date, integer, bigint, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';

// Technician daily performance
// Source: ST reports 374338685, 374367121, 374418414, 398188829, 392071756, 392071757
export const technicianDaily = pgTable('technician_daily', {
  id: serial('id').primaryKey(),
  employeeId: integer('employee_id').notNull().references(() => employees.id),
  employeeName: text('employee_name').notNull(),     // denormalized for query speed
  roleCode: text('role_code').notNull(),              // 'hvac_tech', etc.
  departmentCode: text('department_code'),
  reportDate: date('report_date').notNull(),

  // Core metrics
  revenueCents: bigint('revenue_cents', { mode: 'number' }).notNull().default(0),
  jobsCompleted: integer('jobs_completed').notNull().default(0),
  closeRateBps: integer('close_rate_bps'),           // basis points, nullable (no opps = no rate)
  recallRateBps: integer('recall_rate_bps'),
  avgTicketCents: bigint('avg_ticket_cents', { mode: 'number' }),
  memberships: integer('memberships').notNull().default(0),
  leadsSet: integer('leads_set').notNull().default(0),
  opportunities: integer('opportunities').notNull().default(0),

  // Comfort Advisor-specific (nullable for other roles)
  tglMetrics: integer('tgl_metrics'),                // TGL = Turn Generated Lead
  marketingMetrics: integer('marketing_metrics'),
  optionsPerOpp: integer('options_per_opp_bps'),

  // Source tracking
  sourceReportId: text('source_report_id').notNull(),
  syncedAt: timestamp('synced_at').defaultNow().notNull(),
}, (t) => ({
  uniq: uniqueIndex('tech_daily_uniq').on(t.employeeId, t.reportDate, t.roleCode),
  dateBrin: index('tech_daily_date_brin').on(t.reportDate),  // BRIN for range scans
  deptDate: index('tech_daily_dept_date').on(t.departmentCode, t.reportDate),
  roleDate: index('tech_daily_role_date').on(t.roleCode, t.reportDate),
}));

// Financial daily — department revenue
// Source: ST report 128062649
export const financialDaily = pgTable('financial_daily', {
  id: serial('id').primaryKey(),
  departmentCode: text('department_code').notNull().references(() => departments.code),
  reportDate: date('report_date').notNull(),

  invoicedRevenueCents: bigint('invoiced_revenue_cents', { mode: 'number' }).notNull().default(0),
  completedRevenueCents: bigint('completed_revenue_cents', { mode: 'number' }).notNull().default(0),
  totalRevenueCents: bigint('total_revenue_cents', { mode: 'number' }).notNull().default(0),
  adjustmentRevenueCents: bigint('adjustment_revenue_cents', { mode: 'number' }).notNull().default(0),
  jobs: integer('jobs').notNull().default(0),
  opportunities: integer('opportunities').notNull().default(0),

  sourceReportId: text('source_report_id').notNull(),
  syncedAt: timestamp('synced_at').defaultNow().notNull(),
}, (t) => ({
  uniq: uniqueIndex('fin_daily_uniq').on(t.departmentCode, t.reportDate),
  dateBrin: index('fin_daily_date_brin').on(t.reportDate),
}));

// Call center daily — per-agent metrics
// Source: ST report 2665
export const callCenterDaily = pgTable('call_center_daily', {
  id: serial('id').primaryKey(),
  employeeId: integer('employee_id').references(() => employees.id),
  employeeName: text('employee_name').notNull(),
  reportDate: date('report_date').notNull(),

  totalCalls: integer('total_calls').notNull().default(0),
  inboundCalls: integer('inbound_calls').notNull().default(0),
  outboundCalls: integer('outbound_calls').notNull().default(0),
  callsBooked: integer('calls_booked').notNull().default(0),
  bookingRateBps: integer('booking_rate_bps'),
  avgCallDurationSec: integer('avg_call_duration_sec'),
  memberships: integer('memberships').notNull().default(0),

  sourceReportId: text('source_report_id').notNull(),
  syncedAt: timestamp('synced_at').defaultNow().notNull(),
}, (t) => ({
  uniq: uniqueIndex('cc_daily_uniq').on(t.employeeName, t.reportDate),
  dateBrin: index('cc_daily_date_brin').on(t.reportDate),
}));

// Membership daily — per-membership-type state
// Source: ST report 371386314
export const membershipDaily = pgTable('membership_daily', {
  id: serial('id').primaryKey(),
  membershipName: text('membership_name').notNull(),   // 'Cool Club', 'Cool Club Plus', etc.
  reportDate: date('report_date').notNull(),

  activeStart: integer('active_start').notNull().default(0),
  activeEnd: integer('active_end').notNull().default(0),
  newSales: integer('new_sales').notNull().default(0),
  canceled: integer('canceled').notNull().default(0),
  suspended: integer('suspended').notNull().default(0),
  renewed: integer('renewed').notNull().default(0),
  reactivated: integer('reactivated').notNull().default(0),
  renewalRateBps: integer('renewal_rate_bps'),
  priceCents: integer('price_cents'),                  // tier pricing snapshot

  sourceReportId: text('source_report_id').notNull(),
  syncedAt: timestamp('synced_at').defaultNow().notNull(),
}, (t) => ({
  uniq: uniqueIndex('mem_daily_uniq').on(t.membershipName, t.reportDate),
  dateBrin: index('mem_daily_date_brin').on(t.reportDate),
}));
```

### 2.3 Raw estimate tables

Estimates are different — they're individual records, not daily aggregates. Keep the raw rows, query them directly.

```ts
// src/db/schema/estimates.ts

export const unsoldEstimates = pgTable('unsold_estimates', {
  id: serial('id').primaryKey(),
  estimateId: text('estimate_id').notNull().unique(),  // ST's estimate ID
  customerName: text('customer_name'),
  customerPhone: text('customer_phone'),
  departmentCode: text('department_code'),
  soldBy: text('sold_by'),                             // technician name
  estimateValueCents: bigint('estimate_value_cents', { mode: 'number' }),
  createdDate: date('created_date').notNull(),
  lastFollowUpDate: date('last_follow_up_date'),
  followUpCount: integer('follow_up_count').default(0),
  ageDays: integer('age_days'),
  status: text('status'),                              // 'open', 'dismissed', etc.

  sourceReportId: text('source_report_id').notNull(),
  syncedAt: timestamp('synced_at').defaultNow().notNull(),
}, (t) => ({
  createdIdx: index('unsold_created_idx').on(t.createdDate),
  deptIdx: index('unsold_dept_idx').on(t.departmentCode),
}));

export const estimateAnalysis = pgTable('estimate_analysis', {
  id: serial('id').primaryKey(),
  estimateId: text('estimate_id').notNull().unique(),
  opportunityStatus: text('opportunity_status'),       // 'won' | 'unsold' | 'dismissed'
  estimateStatus: text('estimate_status'),
  soldOn: date('sold_on'),
  createdOn: date('created_on').notNull(),
  subtotalCents: bigint('subtotal_cents', { mode: 'number' }),
  departmentCode: text('department_code'),
  soldBy: text('sold_by'),
  customerName: text('customer_name'),
  timeToCloseDays: integer('time_to_close_days'),
  tierSelected: text('tier_selected'),                 // 'low' | 'mid' | 'high' | null

  sourceReportId: text('source_report_id').notNull(),
  syncedAt: timestamp('synced_at').defaultNow().notNull(),
}, (t) => ({
  createdIdx: index('ea_created_idx').on(t.createdOn),
  statusIdx: index('ea_status_idx').on(t.opportunityStatus),
  deptIdx: index('ea_dept_idx').on(t.departmentCode),
}));
```

### 2.4 Google Reviews

Port the existing schema, clean up the JSONB usage.

```ts
// src/db/schema/reviews.ts

export const googleReviews = pgTable('google_reviews', {
  id: serial('id').primaryKey(),
  reviewId: text('review_id').notNull().unique(),
  locationId: text('location_id').notNull(),          // 'lex' | 'lex_etx' | 'lyons'
  rating: integer('rating').notNull(),                 // 1-5
  text: text('text'),
  reviewerName: text('reviewer_name'),
  reviewerPhotoUrl: text('reviewer_photo_url'),
  createdAt: timestamp('created_at').notNull(),        // when review was posted
  fetchedAt: timestamp('fetched_at').defaultNow().notNull(),
}, (t) => ({
  locationIdx: index('reviews_location_idx').on(t.locationId),
  createdIdx: index('reviews_created_idx').on(t.createdAt),
}));

export const googleReviewsSyncStatus = pgTable('google_reviews_sync_status', {
  id: serial('id').primaryKey(),
  locationId: text('location_id').notNull().unique(),
  lastSyncAt: timestamp('last_sync_at').notNull(),
  fetchedCount: integer('fetched_count').notNull(),
  reportedTotal: integer('reported_total').notNull(),   // what Google says exists
  status: text('status').notNull(),                     // 'ok' | 'partial' | 'error'
  errorMessage: text('error_message'),
});
```

### 2.5 Competition tables

Port as-is from current schema, just in Drizzle.

```ts
// src/db/schema/competitions.ts

export const competitions = pgTable('competitions', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  metricsJson: jsonb('metrics_json').notNull(),  // { soldFlips: 1, itemsSold: 1, reviews: 1 }
  prizesJson: jsonb('prizes_json'),              // { 1: '$500', 2: '$250', 3: '$100' }
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const competitionLeaderboard = pgTable('competition_leaderboard', {
  id: serial('id').primaryKey(),
  competitionId: integer('competition_id').notNull().references(() => competitions.id),
  employeeName: text('employee_name').notNull(),
  departmentCode: text('department_code'),
  soldFlipsCount: integer('sold_flips_count').notNull().default(0),
  itemsSoldCount: integer('items_sold_count').notNull().default(0),
  reviewsCount: integer('reviews_count').notNull().default(0),
  totalPoints: integer('total_points').notNull().default(0),
  rank: integer('rank'),
  previousRank: integer('previous_rank'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  uniq: uniqueIndex('leaderboard_uniq').on(t.competitionId, t.employeeName),
  rankIdx: index('leaderboard_rank_idx').on(t.competitionId, t.rank),
}));

// Raw item/flip records (for dedup + audit)
export const competitionItemsSold = pgTable('competition_items_sold', {
  id: serial('id').primaryKey(),
  competitionId: integer('competition_id').notNull(),
  invoiceId: text('invoice_id').notNull(),
  itemCode: text('item_code').notNull(),
  technicianName: text('technician_name').notNull(),
  quantity: integer('quantity').notNull(),
  invoiceDate: date('invoice_date').notNull(),
}, (t) => ({
  uniq: uniqueIndex('items_sold_uniq').on(t.competitionId, t.invoiceId, t.itemCode),
}));

export const competitionSoldFlips = pgTable('competition_sold_flips', {
  id: serial('id').primaryKey(),
  competitionId: integer('competition_id').notNull(),
  jobId: text('job_id').notNull(),
  technicianName: text('technician_name').notNull(),
  revenueCents: bigint('revenue_cents', { mode: 'number' }),
  jobDate: date('job_date').notNull(),
}, (t) => ({
  uniq: uniqueIndex('sold_flips_uniq').on(t.competitionId, t.jobId),
}));
```

### 2.6 Targets

Period-flexible target model — fixes the current "monthly only" limitation.

```ts
// src/db/schema/targets.ts

export const targets = pgTable('targets', {
  id: serial('id').primaryKey(),
  // What is being targeted
  metric: text('metric').notNull(),             // 'revenue', 'close_rate', 'memberships', etc.
  scope: text('scope').notNull(),               // 'department' | 'role' | 'employee' | 'company'
  scopeValue: text('scope_value'),              // 'hvac_service' | 'hvac_tech' | 'Marcus Vega' | null
  // When it applies
  effectiveFrom: date('effective_from').notNull(),
  effectiveTo: date('effective_to').notNull(),
  // The number
  targetValue: bigint('target_value', { mode: 'number' }).notNull(),  // cents or count or bps
  unit: text('unit').notNull(),                 // 'cents' | 'count' | 'bps'
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  lookup: index('targets_lookup').on(t.metric, t.scope, t.scopeValue, t.effectiveFrom),
}));
```

This replaces the current monthly-keyed targets table. A Q2 HVAC revenue target is one row. An annual close rate target is one row. A per-employee monthly target is one row. All queryable by date range.

### 2.7 Auth tables (Auth.js adapter)

Use the Auth.js Drizzle adapter's standard schema. Add our fields:

```ts
// src/db/schema/auth.ts

export const users = pgTable('users', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  email: text('email').notNull().unique(),
  name: text('name'),
  role: text('role').notNull().default('viewer'),   // 'admin' | 'viewer' | 'display'
  passwordHash: text('password_hash'),              // null for display role
  createdAt: timestamp('created_at').defaultNow().notNull(),
  lastLoginAt: timestamp('last_login_at'),
});

// Auth.js standard tables: sessions, accounts, verification_tokens
// (Drizzle adapter provides these; see: https://authjs.dev/getting-started/adapters/drizzle)

// TV display tokens (separate from user auth)
export const tvTokens = pgTable('tv_tokens', {
  id: serial('id').primaryKey(),
  token: text('token').notNull().unique(),          // random 32-char
  name: text('name').notNull(),                     // 'Sales Bullpen TV', 'Shop TV', etc.
  rotationSequence: jsonb('rotation_sequence').notNull(),  // ['financial', 'comfort_advisors', ...]
  rotationIntervalSec: integer('rotation_interval_sec').notNull().default(30),
  active: boolean('active').notNull().default(true),
  lastSeenAt: timestamp('last_seen_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  revokedAt: timestamp('revoked_at'),
});
```

### 2.8 Sync log

Operational visibility.

```ts
// src/db/schema/sync.ts

export const syncRuns = pgTable('sync_runs', {
  id: serial('id').primaryKey(),
  source: text('source').notNull(),             // 'st_technician', 'st_financial', 'google_reviews'
  trigger: text('trigger').notNull(),           // 'cron' | 'manual' | 'backfill'
  reportId: text('report_id'),                  // ST report ID if applicable
  windowStart: date('window_start').notNull(),
  windowEnd: date('window_end').notNull(),
  status: text('status').notNull(),             // 'running' | 'success' | 'error'
  rowsFetched: integer('rows_fetched'),
  rowsUpserted: integer('rows_upserted'),
  errorMessage: text('error_message'),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  finishedAt: timestamp('finished_at'),
  durationMs: integer('duration_ms'),
}, (t) => ({
  sourceIdx: index('sync_runs_source_idx').on(t.source, t.startedAt),
}));
```

---

## 3. Source mapping

How ST reports map to tables. Each row here becomes one sync function.

| ST Report | ST Category | Internal name | Target table | Upsert key | Notes |
|---|---|---|---|---|---|
| 374338685 | Technician | `comfort_advisor` | `technician_daily` | `(employee_id, report_date, 'comfort_advisor')` | Includes TGL + marketing fields |
| 374367121 | Technician | `hvac_tech` | `technician_daily` | `(employee_id, report_date, 'hvac_tech')` | |
| 374418414 | Technician | `hvac_maintenance` | `technician_daily` | `(employee_id, report_date, 'hvac_maintenance')` | |
| 398188829 | Technician | `commercial_hvac` | `technician_daily` | `(employee_id, report_date, 'commercial_hvac')` | |
| 392071756 | Technician | `plumbing` | `technician_daily` | `(employee_id, report_date, 'plumbing')` | |
| 392071757 | Technician | `electrical` | `technician_daily` | `(employee_id, report_date, 'electrical')` | |
| 2665 | Operations | `call_center` | `call_center_daily` | `(employee_name, report_date)` | |
| 128062649 | Accounting | `financial` | `financial_daily` | `(department_code, report_date)` | |
| 371386314 | Marketing | `memberships` | `membership_daily` | `(membership_name, report_date)` | |
| 346111296 | Operations | `unsold_estimates` | `unsold_estimates` | `estimate_id` | Individual records, not aggregated |
| 399168856 | Operations | `estimate_analysis` | `estimate_analysis` | `estimate_id` | **Now synced nightly**, not live-fetched |
| 394041816 | Technician | `sold_flips` | `competition_sold_flips` | `(competition_id, job_id)` | Competition-scoped |
| 394027220 | Marketing | `items_sold` | `competition_items_sold` | `(competition_id, invoice_id, item_code)` | Competition-scoped |

Roles 1–6 all target the same `technician_daily` table, discriminated by `role_code`. This is intentional — a tech who wears two hats (say, plumbing AM, on-call HVAC PM) gets two rows, one per role, not one blended row.

---

## 4. Sync worker

### 4.1 Trigger model

- **Cron:** `GET /api/sync/tick` hit every 15 minutes by Vercel Cron. Returns 200 quickly after queuing work.
- **Manual:** `POST /api/sync/run` from Admin panel with optional `{ source, windowStart, windowEnd }` body. Same handler, different trigger string in log.
- **Backfill:** `POST /api/sync/backfill` with `{ source, from, to }`. Chunks the window internally.

All three routes share the same worker code; they differ only in how the work item is scoped.

### 4.2 The tick algorithm

Pseudocode — actual implementation lives in `src/lib/sync/tick.ts`:

```
on tick:
  for each source in [technician_*, call_center, financial, memberships, estimates_*, google_reviews]:
    last_success = SELECT max(finished_at) FROM sync_runs
                    WHERE source = :s AND status = 'success'
    staleness_min = (now - last_success) in minutes

    if staleness_min < source.min_interval_min:
      continue  # too fresh, skip

    queue_sync_job(source, window = last 7 days)

  return 200 OK
```

**Staleness intervals** (source → how often it's allowed to run):

| Source | Interval |
|---|---|
| Technician reports (6) | 30 min |
| Call center | 15 min |
| Financial | 30 min |
| Memberships | 60 min |
| Estimates (unsold + analysis) | 6 hours |
| Google Reviews | 2 hours |

These are tuned to the actual change rate of each dataset. The call center updates most often (calls happen all day); estimates settle overnight.

### 4.3 The fetch → upsert loop

One function shape for all ST sources:

```ts
// src/lib/sync/servicetitan/technician.ts

export async function syncTechnicianReport(
  reportId: string,
  roleCode: string,
  window: { from: Date; to: Date },
  trigger: 'cron' | 'manual' | 'backfill'
): Promise<SyncResult> {
  const run = await startSyncRun({ source: `st_${roleCode}`, trigger, ...window });

  try {
    const rows: TechnicianRow[] = [];
    let continuationToken: string | null = null;

    // Fetch all pages
    do {
      const page = await stClient.getReport({
        reportId,
        from: window.from,
        to: window.to,
        page: continuationToken,
      });
      rows.push(...page.rows.map(r => normalizeTechnicianRow(r, roleCode)));
      continuationToken = page.continuationToken;
      await sleep(500);  // rate limit cushion
    } while (continuationToken);

    // Upsert in batches of 500
    let upserted = 0;
    for (const batch of chunks(rows, 500)) {
      await db.insert(technicianDaily).values(batch)
        .onConflictDoUpdate({
          target: [technicianDaily.employeeId, technicianDaily.reportDate, technicianDaily.roleCode],
          set: { /* all metric columns, syncedAt: new Date() */ },
        });
      upserted += batch.length;
    }

    await finishSyncRun(run.id, 'success', { rowsFetched: rows.length, rowsUpserted: upserted });
  } catch (err) {
    await finishSyncRun(run.id, 'error', { errorMessage: String(err) });
    throw err;
  }
}
```

### 4.4 Error handling

- Every sync wraps in try/finally — `sync_runs` always gets a terminal status.
- 429 responses from ST → exponential backoff (1s, 2s, 4s, capped at 10s), 5 retries.
- 5xx responses → 3 retries, then fail the run.
- Partial failures inside a batch: fail the whole run, row counts in the log reflect what was upserted before the failure.
- No row-level logging of errors — it would drown the log. Row-level diffs can be reconstructed by re-running a backfill.

### 4.5 Concurrency

Vercel Cron and manual triggers can race. Solution: advisory locks per source.

```ts
await db.execute(sql`SELECT pg_try_advisory_lock(${hashSource(sourceCode)})`);
// if false, another sync is running — skip
```

Lock is released on function exit (Vercel's 10s/60s/300s limits guarantee this).

### 4.6 Vercel function limits

- Tick handler runs in ≤ 10s (just queues work).
- Individual sync jobs run in ≤ 300s (Pro plan). A 7-day window per source fits easily.
- Backfill uses the longer 300s limit and chunks by month — each chunk is its own invocation triggered by a queue.

---

## 5. Backfill

### 5.1 Scope

- **Range:** Jan 1, 2024 → Dec 31, 2025 (two full calendar years).
- **Scope:** All fact tables (technician_daily, financial_daily, call_center_daily, membership_daily) + estimate_analysis.
- **NOT in scope:** unsold_estimates (time-sensitive, current-only); competitions (scoped to active competitions only); reviews (Google doesn't reliably return old reviews via API).

### 5.2 Runbook

```
# One-time, run from local machine or a dedicated backfill worker
tsx scripts/backfill.ts --from 2024-01-01 --to 2025-12-31

# The script does:
# 1. For each source in [tech_6_roles, financial, call_center, memberships, estimate_analysis]:
#    a. For each month in range:
#       i.  POST /api/sync/backfill { source, from: month_start, to: month_end }
#       ii. Wait for sync_run to finish (poll sync_runs table, 5s intervals)
#       iii. On error, pause, prompt, resume
#       iv. Between months, sleep 30s (ST rate limit kindness)
# 2. Verify row counts per source per month
# 3. Emit summary report
```

**Expected API call count:** ~9,000 total across all sources. At 500ms between calls (safety margin) + pagination + retries, budget ~90 minutes wall-clock. Run it off-hours.

### 5.3 Verification

After backfill, spot-check:

- Row count per source per month should be ≥ 20 (more than zero workdays).
- Sum of `revenueCents` per month should be in plausible range ($1M–$5M).
- No gaps — every month has rows.
- Join against `employees` — every `employee_id` in fact tables resolves.

A verification script lives at `scripts/verify-backfill.ts` and runs automatically after backfill completes.

---

## 6. API contracts

### 6.1 URL conventions

All KPI endpoints live under `/api/kpi/*` and accept the same date parameters:

| Param | Type | Values |
|---|---|---|
| `from` | ISO date | `2026-04-01` |
| `to` | ISO date | `2026-04-20` |
| `preset` | string | `mtd` \| `qtd` \| `ytd` \| `l7` \| `l30` \| `l90` \| `ttm` \| `last_month` \| `today` |
| `compare` | string | `none` \| `prev` \| `ly` \| `ly2` \| `all` (comma-separated combinations allowed) |
| `location` | string | `all` \| `lex` \| `lex_etx` \| `lyons` (defaults to `all`) |

**Resolution:** `preset` takes precedence over `from`/`to`. If both are omitted, defaults to `mtd`.

**Compare semantics:**
- `prev` = previous period of same length (MTD April → MTD March)
- `ly` = same calendar window, one year earlier (Apr 1-20 2026 → Apr 1-20 2025)
- `ly2` = two years earlier
- `all` = returns `prev`, `ly`, and `ly2`
- `none` = returns only current window

### 6.2 Response envelope

Every endpoint returns:

```ts
interface ApiResponse<T> {
  data: T;
  meta: {
    window: { from: string; to: string; preset?: string; label: string };  // 'MTD April'
    compare?: {
      prev?: { from: string; to: string };
      ly?:   { from: string; to: string };
      ly2?:  { from: string; to: string };
    };
    generatedAt: string;  // ISO timestamp
    cacheStatus: 'hit' | 'miss';
  };
}

interface ApiError {
  error: {
    code: string;       // 'invalid_params' | 'upstream_error' | 'not_found'
    message: string;
    details?: unknown;
  };
}
```

HTTP status codes: `200` success, `400` invalid params, `404` no data, `500` internal, `503` upstream (ST) failure.

### 6.3 Endpoints

Each returns data shaped to match `data.js` in the design spec.

#### `GET /api/kpi/financial`

Query: standard params. Returns:

```ts
interface FinancialResponse {
  total: {
    revenue: CompareValue;        // { value, prev?, ly?, ly2?, unit: 'cents' }
    target: number;               // cents, resolved from targets table for window
    percentToGoal: number;        // bps
  };
  departments: Array<{
    code: string;
    name: string;
    colorToken: string;
    revenue: CompareValue;
    target: number;
    jobs: number;
    opportunities: number;
    spark: number[];              // one value per day in window
    lySpark?: number[];           // if compare=ly or compare=all
    ly2Spark?: number[];
  }>;
  trend: Array<{
    date: string;
    actual: number;               // cumulative to-date cents
    ly?: number;
    ly2?: number;
    target: number;
  }>;
  kpis: {
    closeRate: CompareValue;      // unit: 'bps'
    avgTicket: CompareValue;      // unit: 'cents'
    opportunities: CompareValue;  // unit: 'count'
    memberships: CompareValue;    // unit: 'count'
  };
  potential: {
    total: number;                // cents (unsold estimates)
    byDept: Array<{ code, name, value }>;
  };
}

type CompareValue = {
  value: number;
  prev?: number;
  ly?: number;
  ly2?: number;
  unit: 'cents' | 'bps' | 'count';
};
```

#### `GET /api/kpi/technicians`

Query: standard + `role=hvac_tech` (required) + `limit=20` (default).

```ts
interface TechniciansResponse {
  role: { code, name, primaryMetric, sortKey };
  team: {
    revenue: CompareValue;
    closeRate: CompareValue;
    avgTicket: CompareValue;
    jobsDone: CompareValue;
    memberships: CompareValue;
  };
  technicians: Array<{
    rank: number;
    employeeId: number;
    name: string;
    departmentCode: string;
    photoUrl: string | null;
    revenue: number;
    ly?: number;
    closeRate: number;
    lyCloseRate?: number;
    jobs: number;
    lyJobs?: number;
    avgTicket: number;
    lyAvgTicket?: number;
    memberships: number;
    trend: 'up' | 'down' | 'flat';
    spark: number[];
    lySpark?: number[];
  }>;
}
```

#### `GET /api/kpi/callcenter`

```ts
interface CallCenterResponse {
  kpis: {
    booked: CompareValue;
    bookRate: CompareValue;       // bps
    avgWait: CompareValue;        // seconds
    abandonRate: CompareValue;    // bps
  };
  hourly: Array<{
    hr: string;                    // '6a', '7a', etc.
    calls: number;
    booked: number;
    lyCalls?: number;
    lyBooked?: number;
  }>;
  agents: Array<{
    name: string;
    calls: number;
    booked: number;
    rate: number;                  // bps
    lyRate?: number;
  }>;
}
```

#### `GET /api/kpi/memberships`

```ts
interface MembershipsResponse {
  active: number;                 // end-of-window active count
  goal: number;
  newMonth: number;
  churnMonth: number;
  netMonth: number;
  newWeek: number;
  ly?: { active, newMonth, churnMonth, netMonth };
  ly2?: { active, newMonth, churnMonth, netMonth };
  history: number[];              // 12-month active count series
  lyHistory?: number[];
  breakdown: Array<{
    tier: string;
    count: number;
    lyCount?: number;
    price: number;                // cents
    color: string;                // oklch token
  }>;
}
```

#### `GET /api/kpi/estimates`

Powers the Analyze tab. Date range params standard.

```ts
interface EstimatesResponse {
  totals: {
    opportunities: CompareValue;
    closeRate: CompareValue;
    unsoldRealistic: CompareValue;   // weighted by dept multipliers
    avgTicket: CompareValue;
  };
  tierSelection: Array<{ tier, count, pct }>;
  timeToClose: Array<{ bucket, pct }>;
  seasonality: Array<{ m, close, ticket }>;  // 12 months
  byDept: Array<{
    code, name, opps, closeRate, unsold, avgTicket
  }>;
}
```

#### `GET /api/kpi/reviews`

Ports the current `/api/google/reviews` shape.

```ts
interface ReviewsResponse {
  total: number;
  thisMonth: number;
  avgRating: number;
  byStar: { 1, 2, 3, 4, 5: number };
  recent: Array<{ name, rating, date, text }>;
  trend: number[];                   // 12-month avg rating
  byLocation: Array<{
    locationId, total, avgRating, daysSinceLastReview, byStar
  }>;
}
```

#### `GET /api/kpi/leaderboard`

Powers the Top Performers view.

```ts
interface LeaderboardResponse {
  topPerformers: Array<{
    name, role, revenue, rating, reviews
  }>;
  byRole: Record<string, Array<{ name, metric1, metric2, metric3 }>>;
}
```

#### `GET /api/kpi/tools`

Static list. Lives in a config file, not the DB.

```ts
interface ToolsResponse {
  tools: Array<{
    id, title, sub, status: 'Ready' | 'Scheduled' | 'Admin'
  }>;
}
```

### 6.4 Admin endpoints

Separate namespace, all require `role: admin`:

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/admin/users` | GET/POST | List/create users |
| `/api/admin/users/[id]` | PUT/DELETE | Update/delete |
| `/api/admin/targets` | GET/POST | List/create targets |
| `/api/admin/targets/[id]` | PUT/DELETE | Update/delete |
| `/api/admin/tv-tokens` | GET/POST | List/create TVs |
| `/api/admin/tv-tokens/[id]` | PUT/DELETE | Update/revoke |
| `/api/admin/employees/photos` | POST | Upload tech photo |
| `/api/admin/sync/run` | POST | Manual sync trigger |
| `/api/admin/sync/runs` | GET | Sync history |
| `/api/admin/settings` | GET/PUT | System settings |

### 6.5 Sync endpoints

| Endpoint | Method | Purpose | Auth |
|---|---|---|---|
| `/api/sync/tick` | GET | Cron trigger | Vercel Cron secret |
| `/api/sync/run` | POST | Manual trigger | Admin role |
| `/api/sync/backfill` | POST | Backfill chunk | Admin role |
| `/api/sync/status` | GET | Health check | Public |

---

## 7. Caching

### 7.1 Strategy

Two layers:

1. **Postgres** — the source of truth. All KPI queries hit this.
2. **Next.js route cache** — `unstable_cache` or `revalidate` tags on route handlers.

No Redis, no separate cache service.

### 7.2 TTLs by endpoint

| Endpoint | TTL | Invalidation |
|---|---|---|
| `/api/kpi/financial` | 60s | Tag `kpi:financial` on sync success |
| `/api/kpi/technicians` | 60s | Tag `kpi:technicians` |
| `/api/kpi/callcenter` | 30s | Tag `kpi:callcenter` |
| `/api/kpi/memberships` | 300s | Tag `kpi:memberships` |
| `/api/kpi/estimates` | 600s | Tag `kpi:estimates` |
| `/api/kpi/reviews` | 300s | Tag `kpi:reviews` |
| `/api/kpi/leaderboard` | 300s | Tag `kpi:leaderboard` |
| `/api/kpi/tools` | Static | N/A |

On every successful sync, the worker calls `revalidateTag('kpi:<source>')`. Fresh data shows up within one TTL of sync completion, at most.

### 7.3 Cache key includes compare mode

Same endpoint, different `compare` values = different cache entries. A request for MTD + no compare doesn't invalidate a request for MTD + compare=all.

---

## 8. File structure

```
kpi-dashboard/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (dashboard)/        # Auth-gated main app
│   │   ├── display/            # TV display routes
│   │   ├── admin/              # Admin panel
│   │   ├── api/
│   │   │   ├── kpi/            # Dashboard data endpoints
│   │   │   ├── admin/          # Admin endpoints
│   │   │   ├── sync/           # Sync trigger endpoints
│   │   │   └── auth/           # Auth.js
│   │   └── layout.tsx
│   ├── db/
│   │   ├── schema/             # Drizzle schema files (one per domain)
│   │   │   ├── dimensions.ts
│   │   │   ├── facts.ts
│   │   │   ├── estimates.ts
│   │   │   ├── reviews.ts
│   │   │   ├── competitions.ts
│   │   │   ├── targets.ts
│   │   │   ├── auth.ts
│   │   │   └── sync.ts
│   │   ├── client.ts           # Drizzle client singleton
│   │   └── migrations/         # drizzle-kit output
│   ├── lib/
│   │   ├── sync/
│   │   │   ├── servicetitan/   # ST-specific fetchers
│   │   │   │   ├── client.ts
│   │   │   │   ├── technician.ts
│   │   │   │   ├── financial.ts
│   │   │   │   ├── callcenter.ts
│   │   │   │   ├── memberships.ts
│   │   │   │   ├── estimates.ts
│   │   │   │   └── normalize.ts
│   │   │   ├── google/
│   │   │   │   └── reviews.ts
│   │   │   ├── tick.ts         # Cron orchestrator
│   │   │   └── backfill.ts
│   │   ├── query/              # Query helpers (period resolution, aggregations)
│   │   │   ├── periods.ts      # preset → date range
│   │   │   ├── financial.ts
│   │   │   ├── technicians.ts
│   │   │   └── ...
│   │   ├── auth/               # Auth.js config, role helpers
│   │   ├── cache/              # revalidateTag helpers
│   │   └── types/              # Shared TypeScript types
│   └── config/
│       ├── departments.ts      # Dept config (color, sort order)
│       ├── roles.ts            # Role config
│       └── tools.ts            # Static tools list
├── scripts/
│   ├── backfill.ts
│   ├── verify-backfill.ts
│   └── seed-dimensions.ts      # Seed departments, roles, etc.
├── drizzle.config.ts
├── next.config.ts
├── package.json
└── vercel.json                 # Cron config
```

---

## 9. Env

```bash
# Database
DATABASE_URL=postgres://...@neon.tech/kpi

# ServiceTitan
ST_CLIENT_ID=
ST_CLIENT_SECRET=
ST_APP_KEY=
ST_TENANT_ID=1498628772
ST_AUTH_URL=https://auth.servicetitan.io/connect/token
ST_API_URL=https://api.servicetitan.io

# Google
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REFRESH_TOKEN=

# Auth.js
AUTH_SECRET=
AUTH_URL=https://kpi.yourdomain.com

# Vercel Cron
CRON_SECRET=

# Logging
LOG_LEVEL=info
```

All secrets stored in Vercel project env vars. Never in code.

---

## 10. Acceptance criteria

The data layer is "done" when all of these pass:

### Schema
- [ ] `drizzle-kit push` runs cleanly against a fresh Neon DB
- [ ] All tables listed in §2 exist with correct columns, types, and indexes
- [ ] Seed script populates departments, roles, business_unit_map
- [ ] Auth.js migrations applied, admin user seedable

### Sync
- [ ] `GET /api/sync/tick` runs to completion in <10s
- [ ] Each ST report fetcher upserts correctly (test: run twice, row count stable)
- [ ] `sync_runs` table always has a terminal row per sync
- [ ] 429 from ST triggers exponential backoff, logged correctly
- [ ] Advisory lock prevents concurrent runs of same source
- [ ] Manual sync trigger works from `POST /api/admin/sync/run`

### Backfill
- [ ] `scripts/backfill.ts` completes 2024-01-01 → 2025-12-31 for all fact tables
- [ ] Verification script reports no gaps, plausible row counts
- [ ] Backfill can resume after interruption (idempotent via upsert)

### API
- [ ] Every endpoint in §6.3 returns valid Zod-validated responses
- [ ] All date presets resolve correctly (MTD, QTD, YTD, L7, L30, L90, TTM, last_month)
- [ ] Compare modes return correct date windows (verify with manual queries)
- [ ] All endpoints respect `location` filter
- [ ] 400 returned for invalid params with descriptive message
- [ ] Response cache-Hit ratio ≥ 70% after warmup (measured via metadata)

### Data quality
- [ ] Spot-check: MTD revenue for current month matches ST UI within 0.5%
- [ ] Spot-check: YoY comparison for any dept/role returns correct historical numbers
- [ ] Every employee in fact tables has matching row in `employees`
- [ ] No orphaned `department_code` values (FK integrity)

### Observability
- [ ] `sync_runs` queryable via `/api/admin/sync/runs` with 30-day history
- [ ] Pino logs structured JSON, visible in Vercel log drain
- [ ] Failed sync sends alert (Slack webhook or email — configurable)

---

## Appendix A: Period resolution logic

For reference, here's how presets resolve relative to "now" in America/Chicago timezone:

```ts
// src/lib/query/periods.ts

import { startOfMonth, startOfQuarter, startOfYear, subDays, subMonths, subYears, endOfMonth } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

const TZ = 'America/Chicago';

export function resolvePreset(preset: string, now = new Date()): { from: Date; to: Date } {
  const today = toZonedTime(now, TZ);
  switch (preset) {
    case 'today':      return { from: today, to: today };
    case 'l7':         return { from: subDays(today, 6), to: today };
    case 'l30':        return { from: subDays(today, 29), to: today };
    case 'l90':        return { from: subDays(today, 89), to: today };
    case 'mtd':        return { from: startOfMonth(today), to: today };
    case 'qtd':        return { from: startOfQuarter(today), to: today };
    case 'ytd':        return { from: startOfYear(today), to: today };
    case 'ttm':        return { from: subMonths(today, 12), to: today };
    case 'last_month': {
      const lm = subMonths(today, 1);
      return { from: startOfMonth(lm), to: endOfMonth(lm) };
    }
    default: throw new Error(`Unknown preset: ${preset}`);
  }
}

export function resolveCompare(window: { from: Date; to: Date }, mode: 'prev' | 'ly' | 'ly2') {
  if (mode === 'ly')  return { from: subYears(window.from, 1), to: subYears(window.to, 1) };
  if (mode === 'ly2') return { from: subYears(window.from, 2), to: subYears(window.to, 2) };
  if (mode === 'prev') {
    const lenMs = window.to.getTime() - window.from.getTime();
    return {
      from: new Date(window.from.getTime() - lenMs - 86400000),
      to: new Date(window.from.getTime() - 86400000),
    };
  }
  throw new Error(`Unknown compare mode: ${mode}`);
}
```

---

## Appendix B: Glossary

- **bps** (basis points): Integer representation of percentages. 4285 = 42.85%. Avoids float rounding issues.
- **cents**: All money is stored as integer cents. $1,284.50 = 128450.
- **daily grain**: One row per entity per calendar day. The storage pattern this system is built around.
- **CompareValue**: The standard shape for any metric that can be compared (`{ value, prev?, ly?, ly2?, unit }`). UI expects this shape everywhere.
- **Preset**: Named date range (mtd, qtd, etc.) that resolves to `{ from, to }` server-side.
- **Upsert**: INSERT ... ON CONFLICT DO UPDATE. Idempotent — running sync twice produces the same result as running it once.
