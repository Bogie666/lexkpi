# Lex KPI Dashboard — Rebuild Plan

**Scope:** Greenfield rebuild of the KPI dashboard. Top priority is period-comparison flexibility (QTD, TTM, YoY, L30, arbitrary windows). Secondary goals are data efficiency and shipping the Direction A visual refresh. Open to platform consolidation.

---

## 1. The problem with the current architecture

Three things in the existing system make the new requirements expensive to deliver:

**The `period_type` column is the data model's central mistake.** Every performance table (`hvac_tech_performance`, `financial_performance`, `call_center_performance`, etc.) uses `(employee_name, report_date, period_type)` as its unique key, where `period_type` is one of `today | week | mtd | ytd | last_month`. Sync deletes by `period_type` and re-inserts. This means:

- Adding QTD, TTM, L30, or "last quarter" requires a new enum value, a new sync pass per report, and more rows for data that's just a different aggregation of the same underlying events.
- YoY and 2YA comparisons aren't derivable from the stored data at all — `period_type = 'ytd'` only holds the current year. To compare to last year you'd have to preserve the prior year's YTD snapshot, which nothing in the current system does.
- The same transaction is counted in `today`, `mtd`, and `ytd` rows. 13 reports × 5 periods = ~65 sync paths keeping overlapping aggregates warm.

**Sync is a full delete-and-reload.** Every sync drops the rows for that period and re-inserts. That's fine for "today" but cripples historical comparison — there's no accumulating record of daily performance you can slice arbitrarily later.

**Four runtimes for one app.** Next.js on Vercel, Python Cloud Functions, Google Cloud SQL, Google Secret Manager. Each has its own deploy story, monitoring surface, and cost line. For a dashboard that one HVAC company uses, that's overhead that mostly exists because of how it grew, not because it needs to be that way.

**The good news:** the frontend design spec (`Direction A`) is clean, pixel-specified, and has component boundaries already drawn. Porting the UI is the easy part. The architecture work is the load-bearing part.

---

## 2. The architectural shift

**Store events at their natural grain; compute periods on read.**

Instead of pre-aggregating into period buckets, store each technician/job/invoice/call at its finest grain (usually day-level, keyed by `report_date`) with no `period_type` column. Any period — MTD, QTD, YTD, L30, TTM, last year same-MTD, any custom range — becomes a `WHERE report_date BETWEEN ? AND ?` plus a `GROUP BY`.

This single change unlocks everything on the priority list:

| Capability | Old model | New model |
|---|---|---|
| MTD | `WHERE period_type = 'mtd'` | `WHERE report_date >= date_trunc('month', now())` |
| QTD | not possible without schema change | `WHERE report_date >= date_trunc('quarter', now())` |
| TTM | not possible | `WHERE report_date >= now() - interval '12 months'` |
| YoY on any period | not possible | same query, shifted dates |
| Custom date range | not possible | same query, arbitrary dates |
| Adding "last 30 days" | new enum + new sync | zero code changes |

The design spec's `data.total.periods[MTD|QTD|YTD|L30|TTM].{cur, ly, ly2}` becomes **15 parameterized queries** (5 periods × 3 time baselines) against the same table, not 15 separate stored aggregates.

### What this means for sync

Sync becomes **additive and historical**, not destructive:

- Daily: upsert the last ~7 days of data keyed by `(entity_id, report_date)`. ServiceTitan can revise invoices/jobs retroactively, so a rolling window covers corrections without a full reload.
- One-time backfill: pull 2–3 years of history once so YoY and 2YA have something to compare against.
- No more "delete where period_type = X" — rows are permanent history.

**Trade-off:** tables get bigger (you're keeping every day instead of 5 rolled-up snapshots). For a company Lex's size this is nothing — order of hundreds of MB, not GB. PostgreSQL with a BRIN index on `report_date` handles it trivially.

---

## 3. Recommended stack

Since you're open to consolidating, I'd collapse the four runtimes into one Vercel deployment:

| Concern | Current | Proposed |
|---|---|---|
| Frontend | Next.js 16 on Vercel | **Next.js 15 on Vercel** (App Router) |
| Backend APIs | 4 Python Cloud Functions | **Next.js Route Handlers + Server Actions** |
| ServiceTitan sync | Python Cloud Function, manual trigger | **Vercel Cron + TypeScript sync worker** |
| Database | Google Cloud SQL | **Neon** or **Vercel Postgres** (serverless Postgres) |
| Secrets | Google Secret Manager | **Vercel env vars + encrypted at rest** |
| Auth | Custom JWT + localStorage | **Auth.js (NextAuth)** with database sessions |

Why Neon specifically: it's serverless Postgres with branching, which means preview deploys get their own throwaway DB for free. Vercel Postgres works too; Neon is cheaper at this scale and the branching is genuinely useful.

Why drop Python: the sync logic isn't doing anything Python-specific. It's HTTP requests, date math, and bulk inserts. TypeScript keeps it in one language, one repo, one deploy target. You lose `psycopg2`'s bulk insert ergonomics but gain `drizzle-orm`'s typed schema, which catches a whole category of bugs the current setup can't.

Why Auth.js: the current "localStorage JWT + 30s inactivity timeout + no-password display role" is a security smell. Auth.js handles sessions, CSRF, and role-based access properly and integrates with Postgres in ~20 lines.

**One thing to keep:** the Google Business Profile integration. That code is already fine and the data model (cached reviews with a 95% data-loss-protection guard) is well thought out. Port it unchanged.

---

## 4. Target data model

A sketch of the core tables (Drizzle schema, simplified):

```ts
// Facts — one row per entity per day, never deleted
export const technicianDaily = pgTable('technician_daily', {
  id: serial('id').primaryKey(),
  employeeName: text('employee_name').notNull(),
  department: text('department').notNull(),  // consolidated, not ST business unit
  role: text('role').notNull(),              // hvac_tech | comfort_advisor | plumbing | ...
  reportDate: date('report_date').notNull(),
  // Metrics (currency as bigint cents — keep this, it's correct)
  revenueCents: bigint('revenue_cents', { mode: 'bigint' }),
  jobs: integer('jobs'),
  closeRateBps: integer('close_rate_bps'),   // basis points, 0-10000
  recallRateBps: integer('recall_rate_bps'),
  memberships: integer('memberships'),
  avgTicketCents: bigint('avg_ticket_cents', { mode: 'bigint' }),
  // Source traceability
  sourceReportId: text('source_report_id'),
  syncedAt: timestamp('synced_at').defaultNow(),
}, (t) => ({
  uniq: uniqueIndex('tech_daily_uniq').on(t.employeeName, t.reportDate, t.role),
  dateIdx: index('tech_daily_date').on(t.reportDate).using('brin'),
  deptDateIdx: index('tech_daily_dept_date').on(t.department, t.reportDate),
}));

// Similar shape for: financial_daily, call_center_daily, membership_daily
```

Key points:

- No `period_type` column anywhere.
- Currency stays as `bigint` cents — that part of the current system is right.
- Percentages as basis points (0–10000 = 0.00–100.00%) instead of `NUMERIC(4,2)` — integer math is faster and avoids the "cap at 99.99" edge case.
- BRIN index on date is ~1/100th the size of a btree for this access pattern.
- `department` is the consolidated name, not the 26 ST business unit names. Mapping happens once in the sync worker, so queries don't need a join.

### Query layer

Instead of endpoint-per-period (`/hvac-tech/mtd`, `/hvac-tech/ytd`, ...), one endpoint that takes a window:

```
GET /api/kpi/technicians?role=hvac_tech&from=2026-04-01&to=2026-04-20
GET /api/kpi/technicians?role=hvac_tech&preset=mtd
GET /api/kpi/technicians?role=hvac_tech&preset=mtd&compare=ly,ly2
```

The compare parameter returns the LY and LY2 values inline, shaped as `{ value, ly, ly2 }` — exactly what `data.js` in your design spec expects. No second round-trip.

Presets are server-side helpers that resolve to date ranges (`mtd` → first-of-month to today). They're sugar, not a storage concept.

---

## 5. Phased migration

Greenfield doesn't mean "big bang." The current dashboard stays live while the new one is built; cutover happens when the new one is at parity.

### Phase 0 — Foundations (1 week)
- New repo. Next.js 15, Drizzle, Auth.js, Tailwind.
- Port design tokens from `styles.css` into Tailwind config. The oklch custom properties map cleanly.
- Provision Neon with two branches: `main` and `dev`.
- Set up CI — lint, typecheck, test, deploy previews.

### Phase 1 — Sync engine (2 weeks)
- Port the 13 ServiceTitan report fetchers from Python to TypeScript. Each becomes a function that returns an array of typed rows; the insert layer is shared.
- Switch from `delete + insert` to `INSERT ... ON CONFLICT DO UPDATE`.
- Backfill script: fetch last 3 years for each report, chunked by month.
- Vercel Cron hits `/api/sync/tick` every 15 minutes; worker decides what's stale and refreshes a 7-day rolling window.
- Sync log table + admin UI to see health (reuse the current `servicetitan_sync_log` concept).

### Phase 2 — Read API (1 week)
- One route handler per domain (`technicians`, `financial`, `call-center`, `memberships`, `estimates`).
- All accept `from`, `to`, `preset`, `compare`.
- Response shape matches `data.js` in the design spec — `{ value, ly, ly2, prev, unit }` for KPIs, `{ cur, ly, ly2 }` per trend point.
- Cache layer: results keyed by `(endpoint, from, to, compare)`. TTL 5 minutes. Makes the dashboard feel instant even under load.

### Phase 3 — Direction A UI (2–3 weeks)
- Port each `view-*.jsx` from the design files to real components under `components/kpi/`. They're already structured as portable components.
- The shell (`direction-a.jsx`) becomes the main page. Top tabs persist to URL params, not localStorage — shareable links work.
- Compare mode: toggle + year switcher in the nav, as specified. State in URL: `?compare=ly` or `?compare=ly2`.
- Period tabs (`MTD | QTD | YTD | L30 | TTM | Custom`) wired to the same URL param pattern: `?period=qtd` or `?from=...&to=...`.
- Charts: hand-rolled SVG as the spec instructs. No Recharts.
- TV Display mode: reimplemented as a separate `/display` route with its own rotation logic. Don't couple it to the main dashboard's state.

### Phase 4 — Tools, Admin, Widgets (1–2 weeks)
- Port the Tools tab (unsold estimate processor, email signature generator, SEER calculator, etc.).
- Admin: targets, users, tech photos, settings. Auth.js handles the role gating.
- SharePoint widgets (`/widgets/reviews`, `/widgets/revenue`, `/widgets/leaderboard`, `/widgets/coolclub`) rebuilt against the new API. Same iframe CSP, same URL params.
- Competition leaderboard (port the scoring logic).

### Phase 5 — Cutover (1 week)
- Run both dashboards in parallel for a week, same data.
- Validate numbers match on Financial, Technicians, Call Center (pick a few techs and days and diff).
- DNS cutover. Old Cloud Functions and Cloud SQL decommission on a 30-day delay for rollback safety.

**Total: ~8–10 weeks of focused work.**

---

## 6. What I'd do differently beyond the explicit asks

A few things I noticed while reading through that are worth considering while you're rebuilding anyway:

1. **Move targets to the new period model too.** `performance_targets` currently stores `current_value` and recomputes it on read. That's fine, but the monthly granularity means QTD/TTM targets aren't expressible. Store targets as `(metric, entity, effective_from, effective_to, target_value)` so "Q2 HVAC revenue target" and "annual close rate target" coexist naturally.

2. **Estimate Analysis shouldn't be on-demand from ServiceTitan.** Right now the Analyze tab hits ST's Report 399168856 every page load (per your summary). That's a rate-limit risk and a latency hit. Sync it nightly into `estimate_analysis_raw` and query locally — the data isn't time-sensitive enough to justify live fetches.

3. **The "display=true" URL flag is fragile.** Auto-authenticating as a `display` role based on a query string is a pattern worth replacing. Issue a non-expiring, scoped display token per TV, stored server-side, revocable. Then the TV URL is `/display?token=xyz` and the token maps to a role.

4. **Kill the 30-second inactivity timeout.** It's a usability tax that doesn't add real security — if the device is compromised, 30 seconds is plenty. Use Auth.js's rolling-session pattern (refresh on activity, expire on absolute timeout, e.g. 12 hours).

5. **Observability.** Current setup has sync logs but no request tracing. Vercel's built-in analytics + a lightweight logger (pino → Vercel log drain) gives you a much clearer picture of where slow queries live, for free.

---

## 7. Biggest risks

| Risk | Mitigation |
|---|---|
| ServiceTitan rate limits during backfill | Chunk by month, 500ms between requests, respect 429 with exp. backoff (already in current code). |
| Direction A perf on 4K TV display | Hand-rolled SVG is fine, but test the rotation loop for memory leaks. Unmount previous view on rotate, don't just hide it. |
| Number parity old vs new during cutover | Build a diff report: same period, same dept, both APIs. Auto-alert if any metric drifts >0.5%. |
| TypeScript sync slower than Python? | Unlikely — the bottleneck is ST's API, not CPU. But benchmark the backfill before committing. |
| Auth migration breaks existing users | Migration script: copy `dashboard_users` → Auth.js schema, force password reset on first login. |

---

## 8. Decisions locked

Based on the Q&A:

1. **Backfill: 2024 + 2025.** Gives YoY and 2YA for the entire dashboard's lifetime. Backfill runs once, chunked by month to stay within ST rate limits.

2. **TV display is a first-class surface, not a mode.** It's not a query-string retrofit of the admin dashboard — it's its own route, its own component tree, its own auth path. Details in §9.

3. **Admin panel: minimal but polished.** Same Direction A aesthetic, but we're not building a rich editor experience. User management, targets, tech photos, settings — each is a list + form following the same card/table patterns as the main views. Reuses 90% of the component library, so the marginal cost is small.

4. **Charts: 100% hand-rolled SVG.** Rationale in §10. Net result: you get pixel-exact design, smaller bundle, better TV rotation performance, and no Recharts-specific debugging when something looks off.

---

## 9. TV display — design

The TV display is the most-seen surface of this dashboard and the one with the harshest constraints (10-foot viewing distance, rotation, unattended operation). Building it right means treating it as its own app that happens to share data and components with the main dashboard.

### Architecture

- **Route:** `/display/[viewId]` — one URL per view. The rotator is a thin wrapper route `/display` that redirects to views on a timer.
- **Auth:** per-TV token, issued from Admin panel. Token maps to `{ role: 'display', allowedViews: [...], rotationInterval: 30 }`. Stored server-side, revocable, non-expiring until revoked.
- **No client-side rotation logic on the main dashboard.** That coupling was a mistake. The display app does its own rotation via a simple `setInterval` on the `/display` wrapper route.
- **Shared components, display-specific layouts.** Every view component accepts a `variant: 'dashboard' | 'display'` prop. Display variant scales type up, removes interactive controls, increases contrast, adjusts padding. Same data, same logic, different chrome.

### Rotation and resilience

- Pre-fetch the next view's data before rotating (no mid-rotation load spinners).
- If a fetch fails, skip to next view and log. Never show an error screen on a TV.
- Soft reload every 4 hours to prevent memory drift from long-running SPAs.
- `<link rel="prefetch">` on the next-view URL so the transition is instant.
- Rotation sequence is configurable per TV (some TVs in the sales bullpen don't want Call Center, some in the shop don't want Financial, etc.).

### TV config UI

Admin panel gets a new "TVs" section:

- List of configured TVs, each with name, token, location, rotation sequence, interval
- One-click "revoke token" to lock out a lost/retired TV
- Per-TV preview pane
- "Open on this device" QR code for quick initial setup

This is meaningfully better than the current `?display=true` flag because:

- Adding a new TV doesn't require config changes in code
- Pausing Financial on a specific TV (say, during a sensitive period) takes 10 seconds
- Lost/stolen devices can be killed instantly
- You can test a new view sequence without touching all 10 TVs

### Display-specific views to add

The current 10-view rotation is solid but missing:

- **Daily sales goal ticker** — single big number, accent pulse when a sale clears. Good "is the dashboard alive?" signal from across the room.
- **Review of the week** — one standout review, big text, 5 stars, reviewer name. Rotates in once per sequence.

Neither is essential for v1 — flag them as phase 4+ candidates.

---

## 10. Charts — why hand-rolled, what we build

### Why not Recharts

- **Bundle size:** ~90 KB gzipped. On a TV refreshing 10 views on rotation, every byte of parse cost is felt.
- **Styling:** prop-based and opinionated. Matching Direction A's specifics (Geist Mono tabular-nums in tooltips, exact oklch tints, custom axis treatments) means writing override components anyway.
- **Rotation behavior:** Recharts re-mounts on prop changes, causing flicker on TV rotation. Hand-rolled SVG updates in place.
- **Debugging:** when a Recharts chart looks wrong, you're debugging Recharts. When hand-rolled SVG looks wrong, you're debugging 40 lines you wrote.

### What we build

A small internal chart kit — **6 primitives, ~300 lines total:**

| Component | Used in | Complexity |
|---|---|---|
| `<Sparkline>` | Department rows, tech rows | Already in your `utils.js` |
| `<AreaTrend>` | Financial hero, Memberships hero | Simple — one path + gradient fill |
| `<DualTrend>` | Compare mode (this year vs last year vs 2YA) | Already in `compare.jsx` |
| `<StackedBars>` | Call Center hourly (booked on total) | Medium — two bar series |
| `<ComboChart>` | Analyze seasonality (bars + line, dual axis) | Hardest one — ~80 lines |
| `<RatingBars>` | Reviews star distribution | Simple — 5 horizontal bars |

Everything else (pie-style tier selection, time-to-close breakdown) is CSS/HTML, not charts.

### Sharpness requirements

A few details that separate "a chart" from "a sharp chart":

- **SVG `<text>` uses tabular-nums** via `font-variant-numeric: tabular-nums` — numbers don't jitter when values change.
- **Axis labels in Geist Mono at 11px** with 0.08em letter-spacing (matches the spec's eyebrow treatment).
- **Gridlines at 8% opacity of border color**, not arbitrary grey.
- **Hover/touch targets** are invisible `<rect>` overlays, not the chart paths themselves — easier to hit on TV and mobile.
- **Transitions** are CSS `transition: d 300ms ease` on paths when data updates, not per-frame animation.

None of this is hard, but all of it matters for the "really nice and sharp" you asked for.

---

## 11. Adjusted phase plan

Minor changes from the original phasing based on these decisions:

### Phase 0 — Foundations (1 week) — unchanged

### Phase 1 — Sync engine + backfill (2 weeks)
- Same as before, with the explicit 2024 + 2025 backfill scope.
- Backfill runs in a one-off script, not production cron. ~30 days × 24 months × 13 reports = ~9,000 API calls, throttled to 500ms = ~75 minutes of wall-clock time. Doable in an afternoon.

### Phase 2 — Read API (1 week) — unchanged

### Phase 3 — Dashboard UI + chart kit (2–3 weeks)
- Build the 6-chart kit first (day 1–2), everything else depends on it.
- Port each view using the kit.
- Compare mode shares the `<DualTrend>` primitive with the default view — same component, different props.

### Phase 4 — TV display (1 week — **promoted from afterthought**)
- `/display/[viewId]` routes with display-variant component rendering.
- Rotation wrapper with prefetching.
- Admin panel TV management section (token issuance, per-TV config).
- Token-based auth path in Auth.js.
- Parallel testing on an actual TV before cutover — this part is easy to get wrong if you're only testing on a monitor.

### Phase 5 — Admin + Tools + Widgets (1–2 weeks)
- Admin: users, targets, tech photos, settings, **+ TV management**.
- Tools: port each from current dashboard.
- SharePoint widgets rebuilt.

### Phase 6 — Cutover (1 week) — unchanged

**Revised total: ~9–11 weeks.** The extra week over the original estimate is mostly the TV display getting proper time, which was underweighted before.
