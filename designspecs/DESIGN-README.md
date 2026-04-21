# Handoff: Lex KPI Dashboard — Direction A Refresh

## Overview

A visual refresh of the **Lex KPI dashboard** for Service Star Brands (Lexington location). Covers all six primary tabs — Financial, Technicians, Operations, Engagement, Analyze, Tools — in a unified dark-slate aesthetic ("Direction A · Refined"). Replaces the current widget-based dashboard with a cleaner hierarchy, tighter type, monospaced numerals, and a sticky top-level tab bar.

A **YoY Compare mode** swaps Financial / Technicians / Operations into a side-by-side view against last year (or 2 years ago) — toggle in the top nav.

## About the Design Files

The files in `design_files/` are **design references created in HTML + React (via Babel-standalone)**. They are prototypes showing the intended look, layout, and interactions — not production code to copy directly.

Your task is to **recreate these designs inside the existing `Bogie666/kpi-dashboard` Next.js codebase**, using its established patterns: the real widgets under `src/app/widgets/*`, the API routes under `src/app/api/kpi/*`, and the shared utilities in `src/lib/widget-utils.ts` (BRAND tokens, formatRevenue, renderSparkline, initIframeResize, initAutoRefresh). Data shapes in `data.js` are mocked to match the real API responses so the component logic should slot in with minimal rewiring.

## Fidelity

**High-fidelity.** Pixel-level specs: exact oklch colors, spacing scale, typography, border radii, podium elevation, rank medals. Recreate pixel-perfectly using the codebase's existing Tailwind config / CSS modules / whatever pattern is in place.

## Shell & Navigation

### Top nav bar (sticky, z-index 10)
- Backdrop: `color-mix(in oklch, var(--bg) 85%, transparent)` with 12px blur
- Border-bottom: 1px `var(--border)`
- Layout: brand block (logo 32×32 gradient square + 2-line text) · tab list (flex, gap 2px) · right cluster (refresh icon + LIVE pill)
- Each tab: 13px/500, padding 8×14, border-radius 8, active state = surface bg + inset border + 2px accent underline at bottom

### Subtabs (within Operations, Engagement)
- Segmented-control style, 4px inner padding, 10px outer radius
- Active: `var(--surface-2)` with inset border

## YoY Compare Mode

All three data-heavy tabs — **Financial**, **Technicians**, **Operations** — support a year-over-year comparison mode triggered by the **Compare** toggle in the top nav.

### Behavior

- **Toggle** appears only on Financial / Technicians / Operations. When OFF, the dashboard shows its normal month-over-month deltas. When ON, the entire view swaps into compare mode.
- **Year switcher** (appears only when Compare is on): `2025 | 2024` segmented control. Switches the comparison baseline between last year (`ly`) and two years ago (`ly2`).
- **Auto-insights banner** at the top of each comparison view: 2–3 auto-generated callouts highlighting the biggest movers (e.g. "HVAC leading: +16.5% vs last year").
- **KPI tiles** swap from a simple value to a **CompareTile** that shows: big current value + a `+$142K · +12.4%` pill + a "was $X" baseline below. Tile border tints green (up) or red (down).
- **Trend charts** overlay this year (solid, accent color) on top of last year (ghosted line). When 2024 is selected, a second dashed line shows 2-years-ago.
- **Tables** gain Δ columns. On the Financial department table: `Revenue | Last year | Δ vs LY`. On the Technicians leaderboard: adds `Δ Revenue | Δ Close | Δ Ticket` interleaved with the primary columns.
- **Legend** appears below trend charts to identify the overlaid lines (This year / Last year / 2 years ago / Target).

### State

Persisted to `localStorage['lex-kpi-tweaks-v2']`:
```js
{
  compareMode: boolean,      // true when the whole view should be in compare mode
  compareYear: 'ly' | 'ly2'  // which baseline to compare against
}
```

Passed down to views as `compareOn` (guards `compareMode && supportsCompare`) and `compareMode` (the year).

### Data shape

Every numeric KPI that supports compare is wrapped as:
```js
k(value, prev, ly, ly2, unit)  // = { value, prev, ly, ly2, unit }
```

Trend arrays gain `ly` and `ly2` fields per data point. See `data.js`:
- `KPI_DATA.total.periods[PERIOD].{cur, ly, ly2}` — period rollups
- `KPI_DATA.trend[].ly / .ly2` — daily trend overlays
- `KPI_DATA.departments[].ly / .ly2 / .lySpark` — per-dept comparisons
- `KPI_TECHS.team` — team-wide rollup for the banner
- `KPI_TECHS.technicians[].ly / .lySpark / .lyCloseRate / .lyAvgTicket / .lyJobs` — per-tech YoY
- `KPI_OPS.callCenter.hourly[].lyCalls / .lyBooked` — hourly overlay
- `KPI_OPS.memberships.ly / .ly2 / .lyHistory / .breakdown[].lyCount`

### Primitives in `compare.jsx`

- `ComparePill` — inline `+$142K · +12.4%` pill with up/down tone.
- `CompareBanner` — auto-insights strip at top of view.
- `CompareTile` — KPI tile with tinted border, big value, pill + baseline.
- `DualTrend` — SVG line chart that overlays two or three series.
- `TrendLegend` — small legend for dual-line charts.
- `financialInsights(data, mode)` — pure fn that generates up to 3 callout objects from a Financial data bundle.

Each view computes its own insights via a similar pattern — see the `useMemo` block in `TechniciansView`, `CallCenter`, and `Memberships` for examples.

### Period granularity

The period tabs (`MTD`, `QTD`, `YTD`, `L30`, `TTM`) are visual-only in the prototype, but `data.total.periods[PERIOD].{cur, ly, ly2}` is already keyed for each — wire the selected period to pick the matching rollup when you port.

## Screens

### 1. Financial tab
- **Hero band** (grid 1fr 1.2fr): Total revenue display number (Geist Mono, clamp 40–72px, -0.035em tracking, tabular-nums) + trend chart (area/lines/bars via tweak)
- **KPI strip**: 4 cards — Close rate / Avg ticket / Opportunities / Memberships, each with label + big value + delta pill
- **Departments**: switchable between `table` / `cards` / `split` layouts
  - Table columns: Department · Revenue · Target · % Goal (with bar) · vs Last · Trend sparkline
  - Split: table on left, Potential-revenue panel on right

### 2. Technicians tab
- Role sub-tabs (Comfort Advisor / HVAC Tech / HVAC Maint. / Commercial HVAC / Plumbing / Electrical)
- **Podium** (3 columns, 2nd-1st-3rd): 1st is taller, glows with accent-tinted gradient, larger avatar (76×76 vs 64×64), larger metric number (26px vs 22px)
- Avatar: circular, bordered, shows initials via `::before { content: attr(data-initial) }`
- **Leaderboard grid** (60px · 2fr · 1.2fr · 1fr · 0.8fr · 1fr · 1fr · 1fr): Rank pill · Name+swatch · Revenue · Close rate · Jobs · Avg ticket · Memberships · Sparkline
- Rank medals: `rf-rank-1` accent, `rf-rank-2` silver, `rf-rank-3` bronze

### 3. Operations tab
- **Call Center sub-tab**: 4 KPI cards (Booked / Booking rate / Avg wait / Abandon rate), full-width hourly chart (stacked: booked solid-accent on top of total-calls translucent bars), agent leaderboard list
- **Memberships sub-tab**: Hero with big active-count number + goal progress bar + 12-month trend area chart, 4-up KPI strip (new MTD, new week, churn, net), membership mix panel with color-coded per-tier rows (swatch · tier · price · bar · count · pct)

### 4. Engagement tab
- **Reviews sub-tab**: Hero (4.87★ big display + star breakdown 5→1 with per-star bars), 12-month rating trend chart with 4.9 guideline, recent reviews grid (2 cols, avatar · name · stars · date · body text)
- **Top Performers sub-tab**: Podium layout reused from Technicians

### 5. Analyze tab
- 4-up KPI strip (Opportunities / Close rate / Realistic unsold / Avg ticket)
- Split: Seasonality combo chart (monthly close-rate bars + avg-ticket line, 2 axes) · Tier selection + Time to close bar lists
- By-department table: Name · Opps · Close rate · Avg ticket · Realistic unsold

### 6. Tools tab
- Auto-fit grid (minmax 300×1fr), each card: title · status badge (Ready/Scheduled/Admin) · description · `Open →` outline button
- Hover: accent-tinted border, -1px lift

## Design Tokens

```css
/* Direction A — Refined */
--bg:        oklch(0.18 0.01 255);   /* dark slate */
--surface:   oklch(0.22 0.012 255);
--surface-2: oklch(0.26 0.014 255);
--border:    oklch(0.32 0.01 255);
--text:      oklch(0.97 0 0);
--muted:     oklch(0.68 0.01 255);
--danger:    oklch(0.68 0.17 25);
--accent:    oklch(0.72 0.14 235);   /* sky — tweakable */

/* Light theme overrides */
--bg (light):      oklch(0.99 0.003 85);
--surface (light): oklch(0.97 0.005 85);
--text (light):    oklch(0.20 0.01 255);

/* Department swatches */
--d-hvac:        oklch(0.68 0.15 240);
--d-plumbing:    oklch(0.68 0.14 185);
--d-electrical:  oklch(0.72 0.15 85);
--d-commercial:  oklch(0.66 0.16 295);
--d-maintenance: oklch(0.70 0.12 30);

/* Accent presets in tweaks panel */
Sky:      oklch(0.72 0.14 235)
Emerald:  oklch(0.74 0.16 150)
Amber:    oklch(0.80 0.16 85)
Red:      oklch(0.70 0.18 25)
Violet:   oklch(0.68 0.18 295)
Lime:     oklch(0.88 0.20 120)

/* Semantic */
up-pill: oklch(0.78 0.15 150) fg on oklch(0.78 0.15 150 / 0.12) bg
down-pill: var(--danger) fg on oklch(0.68 0.17 25 / 0.12) bg
```

### Typography
- **UI / body**: Geist, 400–600. font-feature-settings 'cv11', 'ss01'
- **Numbers**: Geist Mono, tabular-nums, letter-spacing -0.02 to -0.035em
- **Display number (hero)**: clamp(40px, 5.5vw, 72px), weight 500
- **Section title**: 36px/600/-0.02em
- **Panel title**: 15px/600/-0.01em
- **KPI value**: 28px/600 mono
- **Body**: 13–14px
- **Eyebrow / meta**: 11–12px, uppercase, letter-spacing 0.08em
- **Monospace mini (asOf, dates)**: Geist Mono 11–12px

### Spacing (density tokens)
- compact:  24px × 32px page padding; 12px grid gaps
- cozy:     36px × 48px page padding; 16–24px gaps (default)
- spacious: 56px × 72px page padding; 28px gaps

### Radii
- Panels / hero: 12–16px
- Cards: 12px
- Buttons: 6–10px
- Pills: 4–8px
- Avatar: 50%

### Shadows
- Podium 1st place: `0 8px 24px color-mix(in oklch, var(--accent) 10%, transparent)`
- Tweaks panel: `0 10px 40px rgba(0,0,0,0.4)`
- Live dot halo: `0 0 0 3px oklch(0.78 0.15 150 / 0.2)` + pulse animation

## Interactions

- **Tab switching**: top-level tabs persist via `localStorage['lex-kpi-tweaks-v2'].tab`. Sub-tabs are per-view local state.
- **Tweaks panel**: direction / theme / density / layout / chart / accent — bottom-right floating panel, opens via toolbar or fallback button.
- **Live dot**: 1.8s ease-in-out opacity pulse.
- **Hover states**: nav tab bg tint 4%, tool card border transitions to accent + 1px lift, subtabs color shift.
- **Bar fills**: 300ms ease width transition.

## State Management

Each top-level view is currently stateless (props-driven). Sub-tab state and role selection inside Technicians are local `useState`. Port to whatever state lib the codebase uses — likely Zustand or nothing (URL params).

## Data Shapes

See `data.js` in `design_files/`. Each shape mirrors real API routes:

| View         | Expected endpoint                                | Shape                                                                                  |
|--------------|--------------------------------------------------|----------------------------------------------------------------------------------------|
| Financial    | `/api/kpi/revenue?location=lex&period=mtd`       | `{ total, departments[], potential, trend[], kpis }`                                   |
| Technicians  | `/api/kpi/leaderboard?location=lex&mode=top_per_dept` | `{ roles[], technicians[] }` — derive role list client-side or add endpoint         |
| Operations   | `/api/kpi/callcenter` + `/api/kpi/coolclub`      | `{ callCenter: { booked, bookRate, avgWait, abandonRate, hourly[], agents[] } }` + coolclub shape |
| Engagement   | `/api/google/reviews` + leaderboard              | `{ reviews: { total, thisMonth, avgRating, byStar, recent[], trend[] }, topPerformers[] }` |
| Analyze      | `/api/kpi/estimates` (new)                       | `{ totals, tierSelection[], timeToClose[], seasonality[], byDept[] }`                  |
| Tools        | static                                           | array of `{ id, title, sub, status }`                                                   |

## Assets

No external imagery used. All iconography is text/SVG drawn inline. Avatars are initial-letter placeholders using `::before { content: attr(data-initial) }`. Fonts loaded from Google Fonts: Geist, Geist Mono (others — Fraunces, Inter, JetBrains Mono — only needed for Directions B & C which are scoped to Financial only).

## Files in `design_files/`

- `Lex KPI Refresh.html` — entry. Tab + tweak state, persistence, tweaks panel UI.
- `styles.css` — all tokens + component styles for Directions A, B, C + tweaks.
- `data.js` — mock API data. Replace with real fetches.
- `utils.js` — shared formatters: `fmtMoney`, `pctOf`, `pctChange`, `sparkPath`, `sparkArea`.
- `rf-shared.jsx` — shared Direction A primitives: `DeltaPill`, `Sparkline`, `KpiCard`, `SectionHead`, `PeriodTabs`.
- `compare.jsx` — YoY compare primitives: `ComparePill`, `CompareTile`, `CompareBanner`, `DualTrend`, `TrendLegend`, `financialInsights`.
- `direction-a.jsx` — the tab shell. TABS constant + view dispatcher + Compare toggle/year switcher in nav.
- `view-financial.jsx` — Financial view with layout tweak (table/cards/split).
- `view-technicians.jsx` — Role sub-tabs + podium + leaderboard.
- `view-operations.jsx` — Call Center + Memberships sub-tabs.
- `view-engagement.jsx` — Reviews + Top Performers sub-tabs.
- `view-analyze.jsx` — Seasonality + tier selection + dept breakdown.
- `view-tools.jsx` — Utility cards grid.

Directions B ("Editorial") and C ("Command") are kept in the prototype for Financial only, as alternate aesthetic explorations. Direction A is the one to ship.

## Implementation Notes

1. **Component boundaries**: Each `view-*.jsx` is a natural component file. Port 1:1 as `components/kpi/<ViewName>.tsx`.
2. **Existing widgets**: Several widgets under `src/app/widgets/` already render subsets of this content (`LeaderboardWidget`, `CoolClubWidget`, `ReviewsWidget`). Reuse their data-fetching hooks but replace their markup with the new components.
3. **Periods**: The `PeriodTabs` component is purely visual in this prototype. Wire to real query params / state.
4. **Charts**: All charts are hand-rolled SVG. No charting lib needed. Reuse `sparkPath` / `sparkArea` from `utils.js` for miniatures, and the inline SVG patterns in each view for larger charts.
5. **Responsive**: Media queries in `styles.css` at 1100px and 720px handle tablet/phone. Verify on real devices.
