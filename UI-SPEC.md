# Lex KPI Dashboard — UI Spec

**Audience:** Engineer (or agent) building the frontend. This spec covers component inventory, state model, routing, chart kit, and responsive strategy. Designed to be built against in parallel with `DATA-SPEC.md`.

**Companion docs:** `ARCHITECTURE-SPEC.md` (the why) · `DATA-SPEC.md` (backend).

---

## Table of contents

1. [Stack decisions](#1-stack-decisions)
2. [State model](#2-state-model)
3. [Routing](#3-routing)
4. [Design tokens](#4-design-tokens)
5. [Component inventory](#5-component-inventory)
6. [Chart kit](#6-chart-kit)
7. [Data fetching patterns](#7-data-fetching)
8. [Responsive strategy](#8-responsive)
9. [TV display](#9-tv-display)
10. [Admin panel](#10-admin-panel)
11. [File structure](#11-file-structure)
12. [Acceptance criteria](#12-acceptance)

---

## 1. Stack decisions

| Concern | Choice | Notes |
|---|---|---|
| Framework | Next.js 15 App Router | Same as backend, one runtime |
| UI library | None (component-per-need) | Don't pull in shadcn/Radix for this scope |
| Styling | Tailwind CSS v4 | CSS-first config, oklch-native |
| Data fetching | TanStack Query v5 | Caching, background refresh, retries |
| Routing state | `nuqs` | URL-as-state, typed params |
| Icons | `lucide-react` | Already in use for widgets |
| Animation | `motion` (ex-Framer) | Only where needed (podium, compare pills) |
| Fonts | Geist + Geist Mono via `next/font` | Self-hosted, no FOUT |
| Theme | Dark only (v1) | CSS custom properties, theme-ready for future |

**Explicitly not using:**

- shadcn/ui / Radix — too much surface area for a dashboard that needs ~15 bespoke components
- Framer Motion full install — `motion` package is the modern, smaller version
- Recharts / Chart.js / D3 — hand-rolled SVG (see §6)
- Zustand / Redux / Jotai — state lives in URL or React Query, nothing left for global store

---

## 2. State model

Three tiers of state, with clear rules about what goes where.

### 2.1 URL state (shareable, primary)

Everything that affects what the user sees goes in URL search params. Links are shareable; bookmarking a filtered view works.

Managed via `nuqs` with a single `useDashboardParams()` hook:

```ts
// src/lib/state/url-params.ts

import { parseAsString, parseAsStringEnum, useQueryStates } from 'nuqs';

export const PRESETS = ['today','l7','mtd','qtd','ytd','l30','l90','ttm','last_month'] as const;
export const COMPARE_MODES = ['none','prev','ly','ly2','all'] as const;
export const TABS = ['financial','technicians','operations','engagement','analyze','tools'] as const;

export function useDashboardParams() {
  return useQueryStates({
    tab: parseAsStringEnum(TABS).withDefault('financial'),
    period: parseAsStringEnum(PRESETS).withDefault('mtd'),
    from: parseAsString,      // optional custom range
    to: parseAsString,
    compare: parseAsStringEnum(COMPARE_MODES).withDefault('none'),
    role: parseAsString.withDefault('hvac_tech'),    // for Technicians sub-tabs
    subtab: parseAsString,                            // for Ops/Engagement sub-tabs
    location: parseAsString.withDefault('all'),
  });
}
```

**URL examples:**
- `/?tab=financial&period=mtd` — default Financial MTD view
- `/?tab=financial&period=qtd&compare=ly` — QTD with YoY comparison
- `/?tab=technicians&role=plumbing&period=ytd` — Plumbing YTD leaderboard
- `/?tab=financial&from=2026-01-01&to=2026-03-31` — custom Q1 range

### 2.2 Server state (React Query)

All KPI data. Never stored in React state.

```ts
// src/lib/hooks/use-financial.ts

import { useQuery } from '@tanstack/react-query';
import type { FinancialResponse } from '@/lib/types';

export function useFinancial(params: { from?: string; to?: string; preset?: string; compare?: string; location?: string }) {
  return useQuery<FinancialResponse>({
    queryKey: ['financial', params],
    queryFn: async () => {
      const url = new URL('/api/kpi/financial', window.location.origin);
      Object.entries(params).forEach(([k, v]) => v && url.searchParams.set(k, v));
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Financial fetch failed: ${res.status}`);
      return (await res.json()).data;
    },
    staleTime: 30_000,          // 30s — matches backend cache
    refetchInterval: 60_000,    // background refresh every 1 min
    refetchOnWindowFocus: true,
  });
}
```

One hook per endpoint. All in `src/lib/hooks/`.

### 2.3 Local component state (React useState)

Minimal. Only for genuinely ephemeral UI:

- Sort direction on a table column
- Hover/focus indicators
- Modal open/closed
- Form input values before submit

**Never** for: selected tab, selected period, compare mode, role selection, any data.

### 2.4 Persistent preferences (localStorage)

Only for user preferences that shouldn't be in URLs:

- Table column sort preferences (per-table)
- Density preference (compact/cozy/spacious) — though default is cozy, user can override
- Table vs cards layout preference on Financial

Kept small and isolated in a single `useDashboardPrefs()` hook.

---

## 3. Routing

### 3.1 Route tree

```
/                            → Dashboard (tab via ?tab=)
/display                     → TV rotator wrapper
/display/[viewId]            → Single TV view (comfort_advisors, financial, etc.)
/admin                       → Admin home
/admin/users                 → User management
/admin/targets               → Target management
/admin/tvs                   → TV token management
/admin/photos                → Tech photo upload
/admin/sync                  → Sync status & manual triggers
/admin/settings              → System settings
/api/kpi/*                   → Dashboard data (§DATA-SPEC)
/api/admin/*                 → Admin data (§DATA-SPEC)
/api/auth/*                  → Auth.js
/login                       → Login page
```

**Why all tabs on `/`:** Tabs are just content swaps, not navigations. Keeping them on `/` keeps state sync simple and avoids URL thrash when switching tabs rapidly.

### 3.2 Layout hierarchy

```
app/
├── layout.tsx              → Root: fonts, QueryProvider, ThemeProvider
├── (dashboard)/
│   ├── layout.tsx          → Dashboard shell: nav, tab bar, compare toggle
│   └── page.tsx            → Tab content switcher
├── display/
│   ├── layout.tsx          → TV shell: full-bleed, no chrome, auto-auth
│   ├── page.tsx            → Rotator
│   └── [viewId]/
│       └── page.tsx        → Single view
├── admin/
│   ├── layout.tsx          → Admin shell: sidebar nav
│   ├── page.tsx            → Admin home
│   └── [...sections]
└── login/
    └── page.tsx
```

### 3.3 Auth gates

Route groups + middleware:

- `(dashboard)` — any authenticated role
- `/admin/*` — `role: admin` only, redirect to `/` otherwise
- `/display/*` — no session auth; `?token=xyz` must match an active `tv_tokens` row
- `/login` — unauthenticated only (redirect to `/` if already logged in)

---

## 4. Design tokens

Source of truth lives in `src/styles/tokens.css`, referenced by Tailwind theme extensions.

### 4.1 Color tokens

```css
/* src/styles/tokens.css */

@layer theme {
  :root {
    /* Surfaces */
    --bg:        oklch(0.18 0.01 255);
    --surface:   oklch(0.22 0.012 255);
    --surface-2: oklch(0.26 0.014 255);
    --border:    oklch(0.32 0.01 255);

    /* Text */
    --text:      oklch(0.97 0 0);
    --muted:     oklch(0.68 0.01 255);

    /* Semantic */
    --accent:    oklch(0.72 0.14 235);   /* sky — default */
    --up:        oklch(0.78 0.15 150);   /* green */
    --down:      oklch(0.70 0.18 25);    /* red */
    --warning:   oklch(0.80 0.16 85);    /* amber */

    /* Department swatches */
    --d-hvac:        oklch(0.68 0.15 240);
    --d-plumbing:    oklch(0.68 0.14 185);
    --d-electrical:  oklch(0.72 0.15 85);
    --d-commercial:  oklch(0.66 0.16 295);
    --d-maintenance: oklch(0.70 0.12 30);
    --d-hvac-service:     oklch(0.72 0.14 220);
    --d-hvac-replacement: oklch(0.66 0.16 260);
    --d-tyler:            oklch(0.70 0.13 160);

    /* Pill backgrounds (tinted) */
    --up-bg:   color-mix(in oklch, var(--up) 12%, transparent);
    --down-bg: color-mix(in oklch, var(--down) 12%, transparent);

    /* Navigation backdrop */
    --nav-bg: color-mix(in oklch, var(--bg) 85%, transparent);

    /* Shadows */
    --shadow-podium: 0 8px 24px color-mix(in oklch, var(--accent) 10%, transparent);
    --shadow-panel: 0 4px 12px rgba(0, 0, 0, 0.2);
    --shadow-modal: 0 10px 40px rgba(0, 0, 0, 0.4);
  }
}
```

### 4.2 Tailwind theme extension

```ts
// tailwind.config.ts
export default {
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        border: 'var(--border)',
        text: 'var(--text)',
        muted: 'var(--muted)',
        accent: 'var(--accent)',
        up: 'var(--up)',
        down: 'var(--down)',
        warning: 'var(--warning)',
      },
      fontFamily: {
        sans: ['var(--font-geist)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        'display':     ['clamp(40px, 5.5vw, 72px)', { lineHeight: '1', letterSpacing: '-0.035em', fontWeight: '500' }],
        'section':     ['36px', { lineHeight: '1.1', letterSpacing: '-0.02em', fontWeight: '600' }],
        'panel':       ['15px', { lineHeight: '1.3', letterSpacing: '-0.01em', fontWeight: '600' }],
        'kpi':         ['28px', { lineHeight: '1.1', fontWeight: '600' }],
        'eyebrow':     ['11px', { lineHeight: '1.2', letterSpacing: '0.08em', fontWeight: '500' }],
        'meta-mono':   ['11px', { lineHeight: '1.2', fontFamily: 'var(--font-geist-mono)' }],
      },
      borderRadius: {
        'panel': '14px',
        'card': '12px',
        'btn': '8px',
        'pill': '6px',
      },
      spacing: {
        // Density scale — can be overridden via [data-density] attribute on root
        'pd-compact': '24px',
        'pd-cozy': '36px',
        'pd-spacious': '56px',
      },
    },
  },
} satisfies Config;
```

### 4.3 Typography rules

Enforced via Tailwind utilities — no CSS overrides needed:

| Use | Class | Notes |
|---|---|---|
| Display number (hero) | `text-display font-mono tabular-nums` | Revenue, total calls, etc. |
| Section title | `text-section` | Tab titles |
| Panel title | `text-panel` | Card headers |
| KPI value | `text-kpi font-mono tabular-nums` | Dashboard tiles |
| Eyebrow | `text-eyebrow uppercase text-muted` | "MTD APRIL", "LAST 30 DAYS" |
| Body | `text-sm` (14px) or `text-[13px]` | Copy |
| Mono meta | `text-meta-mono font-mono` | Dates, "as of" stamps |

**Tabular numerals everywhere.** Every number uses `tabular-nums` — this is the single biggest thing that makes a dashboard feel sharp vs. sloppy. Numbers don't jitter when they update.

---

## 5. Component inventory

Every component, its file, its props, what it renders. The agent reads this and writes the components in order.

### 5.1 Primitives (shared, used everywhere)

Located in `src/components/primitives/`.

#### `<Pill>`

```tsx
interface PillProps {
  tone: 'default' | 'up' | 'down' | 'warning' | 'accent';
  size?: 'sm' | 'md';
  children: React.ReactNode;
}
```
Used for deltas, badges, status indicators. Tinted background, colored text.

#### `<DeltaPill>`

```tsx
interface DeltaPillProps {
  current: number;
  previous: number | null | undefined;
  format?: 'money' | 'percent' | 'count' | 'points';
  size?: 'sm' | 'md';
}
```
Shows `+12.4%` or `+$142K` with up/down arrow. Computes delta internally. Renders nothing if `previous` is null.

#### `<ComparePill>`

```tsx
interface ComparePillProps {
  current: number;
  comparison: number;
  unit: 'cents' | 'bps' | 'count';
  baseline: 'prev' | 'ly' | 'ly2';
  size?: 'sm' | 'md';
}
```
The richer pill for compare mode: `▲ +$142K · +12.4%`. Distinct from DeltaPill because it shows both absolute and percent.

#### `<Stat>`

```tsx
interface StatProps {
  label: string;
  value: number;
  unit: 'cents' | 'bps' | 'count' | 'seconds';
  comparison?: CompareValue;  // triggers DeltaPill/ComparePill
  compareMode?: 'prev' | 'ly' | 'ly2';
  emphasis?: 'default' | 'hero';  // hero = display-size number
}
```
The workhorse KPI tile. Used in every view's KPI strip.

#### `<SectionHead>`

```tsx
interface SectionHeadProps {
  eyebrow: string;
  title: string;
  right?: React.ReactNode;  // usually PeriodTabs + "as of" timestamp
}
```
Standard section header with eyebrow, title, right-aligned controls.

#### `<PeriodTabs>`

```tsx
interface PeriodTabsProps {
  value: Preset;
  onChange: (p: Preset) => void;
  options?: Preset[];  // defaults to [mtd, qtd, ytd, l30, ttm]
}
```
The segmented period selector. Updates URL via `nuqs`.

#### `<Panel>`

```tsx
interface PanelProps {
  title?: string;
  eyebrow?: string;
  right?: React.ReactNode;
  padding?: 'cozy' | 'tight' | 'none';
  children: React.ReactNode;
}
```
The container for any boxed content. Surface background, border, panel radius.

#### `<LiveDot>`

Small pulsing green dot. Used in nav.

```tsx
interface LiveDotProps {
  size?: 'sm' | 'md';
}
```

#### `<Skeleton>`

```tsx
interface SkeletonProps {
  variant: 'text' | 'stat' | 'chart' | 'table-row' | 'avatar';
  count?: number;
}
```
Loading shimmer. Shape-aware — `variant="stat"` renders the right sized blocks for a KPI tile.

### 5.2 Layout components

Located in `src/components/layout/`.

#### `<DashboardShell>`

Top-level wrapper. Contains `<NavBar>`, renders children, provides density class.

```tsx
interface DashboardShellProps {
  children: React.ReactNode;
}
```

#### `<NavBar>`

The sticky top nav. Contains: brand block, tab list, compare toggle (conditional), year switcher (conditional), refresh button, LIVE pill.

```tsx
interface NavBarProps {
  activeTab: Tab;
  onTabChange: (t: Tab) => void;
  compareMode: CompareMode;
  onCompareChange: (m: CompareMode) => void;
  compareSupported: boolean;
}
```

Pixel-level spec:
- Sticky, z-index 10
- Backdrop: `bg-nav` (the mixed `--nav-bg` token) with `backdrop-blur-[12px]`
- Border-bottom: 1px `var(--border)`
- Tab buttons: 13px/500, padding `8px 14px`, rounded-btn
- Active tab: `bg-surface-2`, inset border, 2px accent underline at bottom

#### `<TabBar>`

The row of main tabs inside `<NavBar>`. Wraps `<nuqs>` state.

#### `<SubTabBar>`

The segmented-control style sub-tabs used inside Operations and Engagement. 4px inner padding, 10px outer radius. Active: `bg-surface-2` with inset border.

```tsx
interface SubTabBarProps {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ id: string; label: string }>;
}
```

#### `<CompareBanner>`

The auto-insights strip at top of Financial/Technicians/Operations in compare mode.

```tsx
interface CompareBannerProps {
  insights: Array<{ tone: 'up' | 'down' | 'neutral'; title: string; sub: string }>;
}
```

Up to 3 callouts. Icons per tone. Already structured in `compare.jsx` — port as-is.

### 5.3 Financial view

Located in `src/components/views/financial/`.

#### `<FinancialView>`

Top-level view. Composes hero + KPI strip + department display.

```tsx
interface FinancialViewProps {
  params: DashboardParams;  // from useDashboardParams
}
```

Internally calls `useFinancial(params)`, handles loading/error/empty, passes data to children.

#### `<FinancialHero>`

The grid 1fr / 1.2fr hero band. Left: display number + meta. Right: trend chart.

Two variants based on compare mode:
- Normal: show `<DeltaPill>` vs previous period
- Compare on: show `<ComparePill>` with DualTrend chart + legend

#### `<FinancialKPIStrip>`

4-card row: Close rate, Avg ticket, Opportunities, Memberships. Each is a `<Stat>`.

Responsive: 4 cols @ `lg+`, 2 cols @ `md`, 1 col @ `sm`.

#### `<DepartmentTable>`

The Financial department table. Sticky name column, sortable.

Columns: Department · Revenue · Target · % to Goal (with bar) · vs Last · Trend sparkline · (Δ vs LY in compare mode).

```tsx
interface DepartmentTableProps {
  departments: Array<Department>;
  compareMode: CompareMode;
  sortKey?: string;
  onSortChange?: (key: string) => void;
}
```

#### `<DepartmentCards>` / `<DepartmentSplit>`

Alternate layouts for the same data. User-switchable via layout preference.

#### `<PotentialRevenuePanel>`

The unsold-estimates panel shown in "split" layout. Total + per-department bars.

### 5.4 Technicians view

Located in `src/components/views/technicians/`.

#### `<TechniciansView>`

Role sub-tabs + podium + leaderboard.

#### `<RoleSubTabs>`

Horizontal scrollable tabs on mobile, full row on desktop. Each tab: role name + primary metric badge.

#### `<Podium>`

3-up podium: 2nd · 1st (taller, glowing) · 3rd. Each slot: `<PodiumCard>`.

```tsx
interface PodiumProps {
  performers: [first: Performer, second: Performer, third: Performer];
  metric: 'revenue' | 'avgTicket' | 'jobs';
}
```

Pixel-level spec:
- 1st place: `height: 100%`, avatar 76×76, metric 26px, `box-shadow: var(--shadow-podium)`
- 2nd/3rd: `height: 88%`, avatar 64×64, metric 22px
- Medal emojis: 🥇🥈🥉 at top-right of each card
- Avatar: circular, 1px border in accent color for 1st
- Missing photo fallback: initials via `::before { content: attr(data-initial) }`

#### `<PodiumCard>`

```tsx
interface PodiumCardProps {
  rank: 1 | 2 | 3;
  name: string;
  department: string;
  photoUrl?: string | null;
  metric: { label: string; value: number; unit: string };
}
```

#### `<TechLeaderboard>`

The full leaderboard grid below the podium.

Grid: `60px · 2fr · 1.2fr · 1fr · 0.8fr · 1fr · 1fr · 1fr`
(Rank · Name+swatch · Revenue · Close rate · Jobs · Avg ticket · Memberships · Sparkline)

Compare mode adds interleaved Δ columns.

```tsx
interface TechLeaderboardProps {
  technicians: Array<Technician>;
  compareMode: CompareMode;
  role: string;
}
```

### 5.5 Operations view

Located in `src/components/views/operations/`.

#### `<OperationsView>`

Sub-tabs: Call Center | Memberships.

#### `<CallCenterPanel>`

- 4-up KPI strip: Booked · Booking rate · Avg wait · Abandon rate
- Full-width hourly chart: `<StackedBars>`
- Agent leaderboard list

#### `<MembershipsPanel>`

- Hero: big active-count + goal progress bar + 12-month `<AreaTrend>`
- 4-up KPI strip: New MTD · New week · Churn · Net
- Membership mix panel: per-tier rows (swatch · tier · price · bar · count · pct)

### 5.6 Engagement view

Located in `src/components/views/engagement/`.

#### `<EngagementView>`

Sub-tabs: Reviews | Top Performers.

#### `<ReviewsPanel>`

- Hero: big avg rating (4.87★) + `<RatingBars>` for star distribution
- 12-month rating trend chart with 4.9 guideline
- Recent reviews grid (2 cols): avatar · name · stars · date · body (4-line clamp)

#### `<TopPerformersPanel>`

Reuses `<Podium>` from Technicians, but ranks across all roles.

### 5.7 Analyze view

Located in `src/components/views/analyze/`.

#### `<AnalyzeView>`

- 4-up KPI strip: Opportunities · Close rate · Realistic unsold · Avg ticket
- Split: `<ComboChart>` seasonality + tier selection + time-to-close panels
- Department breakdown table

#### `<TierSelectionBars>`

Horizontal bar list: Low / Mid / High with percentages.

#### `<TimeToCloseBars>`

Horizontal bar list: Same day / 1–7 days / 8+ days with percentages.

### 5.8 Tools view

Located in `src/components/views/tools/`.

#### `<ToolsView>`

Auto-fit grid (minmax 300px, 1fr), each card:

```tsx
interface ToolCardProps {
  id: string;
  title: string;
  sub: string;
  status: 'Ready' | 'Scheduled' | 'Admin';
  onOpen: () => void;
}
```

Hover: accent-tinted border, -1px lift. Click opens a modal or routes to a tool page.

---

## 6. Chart kit

Located in `src/components/charts/`. Hand-rolled SVG, no external chart library.

### 6.1 Shared utilities

```ts
// src/lib/charts/scale.ts

export function linearScale(domain: [number, number], range: [number, number]) {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  return (v: number) => r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);
}

export function niceTicks(max: number, count = 5): number[] {
  // Round max up to a nice number, return evenly spaced ticks
  const step = Math.pow(10, Math.floor(Math.log10(max / count)));
  const niceStep = Math.ceil(max / count / step) * step;
  return Array.from({ length: count + 1 }, (_, i) => i * niceStep);
}

// Already in utils.js, port to TypeScript:
export function sparkPath(values: number[], width: number, height: number): string {
  // Returns SVG path `d` attribute
}

export function sparkArea(values: number[], width: number, height: number): string {
  // Closed area under the line
}
```

### 6.2 Primitives

#### `<Sparkline>`

```tsx
interface SparklineProps {
  values: number[];
  compareValues?: number[];
  width?: number;       // default 80
  height?: number;      // default 24
  stroke?: string;      // default var(--accent)
  fill?: 'none' | 'area';
}
```

Used in department rows, tech rows. ~30 lines of SVG.

#### `<AreaTrend>`

```tsx
interface AreaTrendProps {
  data: Array<{ date: string; value: number; target?: number }>;
  height?: number;       // default 180
  showTarget?: boolean;
  accent?: string;
}
```

Used in Financial hero and Memberships hero. Filled area + line + optional target line.

Features:
- X-axis: day labels (every 5th day, auto-skip on narrow)
- Y-axis: niceTicks with mono labels
- Gradient fill under line (accent → transparent)
- Hover: vertical line + value tooltip

~80 lines.

#### `<DualTrend>`

```tsx
interface DualTrendProps {
  data: Array<{ date: string; actual: number; ly?: number; ly2?: number; target?: number }>;
  mode: 'ly' | 'ly2';     // which comparison baseline
  height?: number;
  accent?: string;
}
```

Compare mode version. Solid accent line for current + ghosted/dashed for LY and (if mode=ly2) LY2. Target line dashed.

Structure identical to `<AreaTrend>` plus 1–2 additional line paths.

~100 lines.

#### `<StackedBars>`

```tsx
interface StackedBarsProps {
  data: Array<{ label: string; total: number; highlighted: number; lyTotal?: number; lyHighlighted?: number }>;
  compareMode?: CompareMode;
  height?: number;
  accentHighlight?: string;
}
```

Used in Call Center hourly chart. `total` bar in translucent color, `highlighted` (booked) bar in solid accent on top. LY comparison adds ghosted bars behind.

~60 lines.

#### `<ComboChart>`

```tsx
interface ComboChartProps {
  data: Array<{ label: string; bar: number; line: number }>;
  barAxis: { label: string; unit: 'bps' | 'count' };
  lineAxis: { label: string; unit: 'cents' | 'count' };
  height?: number;
}
```

The Analyze seasonality chart. Dual Y-axis: close-rate bars + avg-ticket line.

~100 lines. The hardest primitive in the kit, but still straightforward.

#### `<RatingBars>`

```tsx
interface RatingBarsProps {
  distribution: { 1: number; 2: number; 3: number; 4: number; 5: number };
  showCounts?: boolean;
}
```

5 horizontal bars, top-to-bottom 5★ → 1★. Bar width = pct of total, count shown at end.

~30 lines.

### 6.3 Chart rendering rules

These apply to every chart:

- **SVG `<text>` always uses `font-variant-numeric: tabular-nums`.**
- **Gridlines at 8% opacity of `var(--border)`.** Horizontal only, never vertical.
- **Axis labels in Geist Mono at 11px with 0.08em letter-spacing.**
- **Hover overlays are invisible `<rect>` elements with `pointer-events: all`.** Chart paths have `pointer-events: none`.
- **Transitions on data updates: `transition: d 300ms ease` on paths.** Not animated per-frame.
- **No chart animations on initial mount.** Data should appear, not sweep in. (Animations on mount are expensive on TV rotation.)
- **`preserveAspectRatio="none"` only for pure sparklines.** Everything else respects aspect ratio.

### 6.4 Responsive strategy for charts

Charts respond to container width via CSS, not JS:

```tsx
<div className="w-full aspect-[16/9] sm:aspect-[3/1]">
  <svg viewBox="0 0 800 300" preserveAspectRatio="xMidYMid meet" className="w-full h-full">
    {/* ... */}
  </svg>
</div>
```

No `ResizeObserver` needed — SVG scales naturally. Axis label density uses CSS media queries to hide every other label on narrow screens.

---

## 7. Data fetching

### 7.1 QueryClient setup

```tsx
// src/app/providers.tsx

'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

export function Providers({ children }: { children: React.ReactNode }) {
  const [qc] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: true,
        retry: 2,
      },
    },
  }));
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}
```

Mounted in root layout.

### 7.2 Hook conventions

One hook per endpoint. Naming: `use<Endpoint>(params)`.

- `useFinancial(params)` → `GET /api/kpi/financial`
- `useTechnicians(params)` → `GET /api/kpi/technicians`
- `useCallCenter(params)` → `GET /api/kpi/callcenter`
- `useMemberships(params)` → `GET /api/kpi/memberships`
- `useEstimates(params)` → `GET /api/kpi/estimates`
- `useReviews(params)` → `GET /api/kpi/reviews`
- `useLeaderboard(params)` → `GET /api/kpi/leaderboard`

All return `{ data, isLoading, error, refetch }` from React Query. Views handle all three states explicitly.

### 7.3 Loading and error states

Every view follows this pattern:

```tsx
function FinancialView({ params }) {
  const { data, isLoading, error } = useFinancial(params);

  if (isLoading) return <FinancialSkeleton />;
  if (error) return <ViewError error={error} onRetry={refetch} />;
  if (!data) return <ViewEmpty />;

  return <FinancialContent data={data} params={params} />;
}
```

- `<FinancialSkeleton>` — shape-matched loading placeholder per view (not a spinner).
- `<ViewError>` — friendly error + retry button. Never shows raw error text to user.
- `<ViewEmpty>` — "No data for this period" with suggestion to widen the range.

### 7.4 Background refresh

- `refetchInterval: 60_000` on all queries (1 min).
- `refetchOnWindowFocus: true` — refresh when user returns to tab.
- No manual refresh button needed in nav (the ↻ icon in the spec is for parity only — it calls `queryClient.invalidateQueries()`).

### 7.5 Optimistic updates

Only in Admin panel mutations (create target, revoke TV token, etc.). Use `useMutation` with `onMutate` for optimistic UI, rollback on error.

---

## 8. Responsive strategy

"Fully responsive including phones" means 4 explicit breakpoints:

| Name | Range | Target devices |
|---|---|---|
| `sm` | < 640px | Phones (portrait) |
| `md` | 640–1024px | Tablets, phones landscape |
| `lg` | 1024–1600px | Desktops, laptops |
| `xl` | 1600px+ | 4K displays, TVs |

### 8.1 Layout shifts per breakpoint

**Nav bar:**
- `lg+`: Full brand text, tab labels, right cluster
- `md`: Brand logo + short tab names (FIN, TECH, OPS), right cluster compact
- `sm`: Hamburger menu → drawer with tab list, brand logo only, compare toggle in drawer

**Financial view:**
- `lg+`: Hero (1fr 1.2fr grid), 4-col KPI strip, table/cards/split layouts
- `md`: Hero stacks (chart below number), 2-col KPI strip, cards layout only
- `sm`: Hero stacks, 1-col KPI strip, cards with horizontal scroll for table

**Technicians view:**
- `lg+`: Podium side-by-side 2-1-3, full leaderboard grid with all columns
- `md`: Podium 2-1-3, leaderboard drops sparkline column
- `sm`: Podium stacks (1, 2, 3), leaderboard as cards not table

**Call Center:**
- `lg+`: Hourly chart full-width, agent list below
- `md`: Same
- `sm`: Hourly chart scrolls horizontally (min-width 600px inside overflow), agent list stacks

**Tables universally:**
- Sticky first column on `md+`
- On `sm`: convert to card list, each row becomes a stacked card

### 8.2 Touch targets

- Minimum 44×44px for all tappable elements on `sm`
- Period tabs get taller padding (12px vs 8px) on `sm`
- Sub-tabs become horizontally scrollable with momentum scroll

### 8.3 Mobile-specific patterns

- **Pull-to-refresh:** not implemented. Users can pull the nav down to show the refresh button instead.
- **Swipe between tabs:** not implemented for v1. Adds complexity for marginal value.
- **Bottom sheet for filters:** on `sm`, the compare toggle + period picker combine into a bottom sheet triggered by a filter icon.

### 8.4 Testing

Every view has a screenshot test at:
- 375×812 (iPhone SE)
- 768×1024 (iPad)
- 1440×900 (MacBook)
- 3840×2160 (4K TV) — for display variant

---

## 9. TV display

This is a full app, not a mode. See separate implementation notes.

### 9.1 Routes

- `/display` — rotator wrapper. Reads TV token, determines rotation sequence, redirects to `/display/[viewId]` on a timer.
- `/display/[viewId]` — single view, no chrome, full bleed.

### 9.2 Auth

Token-based via `?token=xyz` URL param. Middleware validates against `tv_tokens` table:

```ts
// src/middleware.ts — TV token branch
if (pathname.startsWith('/display')) {
  const token = request.nextUrl.searchParams.get('token');
  if (!token) return NextResponse.redirect('/login?reason=tv_no_token');
  const tv = await db.query.tvTokens.findFirst({
    where: and(eq(tvTokens.token, token), eq(tvTokens.active, true))
  });
  if (!tv) return NextResponse.redirect('/login?reason=tv_invalid');
  // inject tv config into request headers for downstream
  return NextResponse.next({ headers: { 'x-tv-id': String(tv.id) } });
}
```

TV token also stamps `lastSeenAt` on every request — helps admin see which TVs are alive.

### 9.3 Rotation logic

```tsx
// src/app/display/page.tsx

'use client';

export default function TVRotator() {
  const tv = useTVConfig();  // from middleware-injected header
  const [idx, setIdx] = useState(0);
  const sequence = tv.rotationSequence;
  const intervalMs = tv.rotationIntervalSec * 1000;

  useEffect(() => {
    const id = setInterval(() => {
      setIdx(i => (i + 1) % sequence.length);
    }, intervalMs);
    return () => clearInterval(id);
  }, [sequence.length, intervalMs]);

  const currentView = sequence[idx];
  const nextView = sequence[(idx + 1) % sequence.length];

  return (
    <>
      {/* Prefetch next view's data */}
      <link rel="prefetch" href={`/api/kpi/${nextView}`} />
      <DisplayView viewId={currentView} />
    </>
  );
}
```

### 9.4 DisplayView component

```tsx
interface DisplayViewProps {
  viewId: string;  // 'financial' | 'comfort_advisors' | 'hvac_tech' | ...
}
```

Internally switches to the right view component with `variant="display"` prop. Each view component respects the variant:

```tsx
function FinancialView({ variant = 'dashboard', ... }) {
  const cls = variant === 'display' ? 'tv-display' : '';
  return (
    <div className={cls} data-variant={variant}>
      {/* same content, larger type, no controls */}
    </div>
  );
}
```

The `.tv-display` CSS scales type up proportionally:

```css
[data-variant="display"] {
  font-size: 1.5em;
  --density-pad: 72px;  /* spacious */
}
[data-variant="display"] .hide-on-tv { display: none; }
```

Interactive controls (period tabs, compare toggle, refresh button, tweaks panel) all get `.hide-on-tv`.

### 9.5 Resilience

- **Prefetch next view** via `<link rel="prefetch">`.
- **Error boundary around each view** — if one view crashes, skip to next instead of crashing the rotator.
- **Soft reload every 4 hours** via `setTimeout(() => window.location.reload(), 4 * 60 * 60 * 1000)` to prevent memory drift.
- **No loading spinners on TV** — prefetch should prevent them; if they show, it's a bug.

### 9.6 TV views beyond the main 6

The current system rotates through 10 views including per-role leaderboards. Map:

| viewId | Renders | Source of data |
|---|---|---|
| `financial` | `<FinancialView variant="display">` | `/api/kpi/financial` |
| `comfort_advisors` | `<TechniciansView role="comfort_advisor" variant="display">` | `/api/kpi/technicians` |
| `hvac_tech` | Same, role=hvac_tech | Same |
| `hvac_maintenance` | Same, role=hvac_maintenance | Same |
| `commercial_hvac` | Same, role=commercial_hvac | Same |
| `plumbing` | Same, role=plumbing | Same |
| `electrical` | Same, role=electrical | Same |
| `call_center` | `<CallCenterPanel variant="display">` | `/api/kpi/callcenter` |
| `memberships` | `<MembershipsPanel variant="display">` | `/api/kpi/memberships` |
| `reviews` | `<ReviewsPanel variant="display">` | `/api/kpi/reviews` |

---

## 10. Admin panel

Minimal but polished. Same design tokens, same component primitives.

### 10.1 Layout

Sidebar nav on `lg+`, top-tab nav on `md` and below.

```
/admin
├── Dashboard Overview       — Sync status, user count, recent activity
├── Users                    — List/create/edit/delete dashboard users
├── Targets                  — List/create/edit/delete performance targets
├── TVs                      — List/create/edit/revoke TV tokens
├── Tech Photos              — Upload/manage tech headshots
├── Sync                     — Sync history, manual trigger, health
└── Settings                 — System config (location list, etc.)
```

### 10.2 Page pattern

Every admin page follows the same structure:

```
<SectionHead eyebrow="Admin" title="Users" right={<Button>+ New User</Button>} />

<Panel>
  <DataTable
    columns={[...]}
    rows={users}
    onRowClick={openEditModal}
  />
</Panel>

<Modal open={editOpen}>
  <UserForm ... />
</Modal>
```

### 10.3 Shared admin components

#### `<DataTable>`

Generic admin table. Columns with sort. Row click opens edit modal.

#### `<Modal>`

Standard modal with backdrop, close button, escape-to-dismiss.

#### `<Form>` + `<Field>`

Uncontrolled form wrapper. Validation via Zod (same schemas as API).

### 10.4 TV management page

Slightly more involved than others. Detailed in `UI-SPEC §9.2`.

Features:
- List of TVs with columns: Name · Last seen · Interval · Status · Actions
- Row click: edit modal with name, rotation sequence (drag-sortable), interval
- "New TV" modal: auto-generates token, shows QR code for initial setup
- "Revoke" action: confirmation modal, sets `revokedAt`
- Each row status: 🟢 active (last_seen < 5 min), 🟡 stale (< 1h), 🔴 offline

### 10.5 Sync status page

Health dashboard for the sync worker:

- Big status: "All systems green" or list of failing sources
- Per-source table: Source · Last success · Last attempt · Staleness · Status
- Recent sync runs table (last 30): Source · Trigger · Status · Duration · Rows
- Manual sync section: dropdown of sources + "Run now" button

---

## 11. File structure

```
kpi-dashboard/
├── src/
│   ├── app/
│   │   ├── layout.tsx                   # Root — fonts, providers, theme
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx               # DashboardShell
│   │   │   └── page.tsx                 # Tab switcher
│   │   ├── display/
│   │   │   ├── layout.tsx               # TV shell (no chrome)
│   │   │   ├── page.tsx                 # Rotator
│   │   │   └── [viewId]/page.tsx        # Single view
│   │   ├── admin/
│   │   │   ├── layout.tsx               # Admin shell
│   │   │   ├── page.tsx                 # Admin overview
│   │   │   ├── users/page.tsx
│   │   │   ├── targets/page.tsx
│   │   │   ├── tvs/page.tsx
│   │   │   ├── photos/page.tsx
│   │   │   ├── sync/page.tsx
│   │   │   └── settings/page.tsx
│   │   ├── login/page.tsx
│   │   ├── api/                         # (see DATA-SPEC)
│   │   └── providers.tsx                # React Query, nuqs
│   ├── components/
│   │   ├── primitives/                  # §5.1
│   │   │   ├── pill.tsx
│   │   │   ├── delta-pill.tsx
│   │   │   ├── compare-pill.tsx
│   │   │   ├── stat.tsx
│   │   │   ├── section-head.tsx
│   │   │   ├── period-tabs.tsx
│   │   │   ├── panel.tsx
│   │   │   ├── live-dot.tsx
│   │   │   └── skeleton.tsx
│   │   ├── layout/                      # §5.2
│   │   │   ├── dashboard-shell.tsx
│   │   │   ├── nav-bar.tsx
│   │   │   ├── tab-bar.tsx
│   │   │   ├── subtab-bar.tsx
│   │   │   └── compare-banner.tsx
│   │   ├── charts/                      # §6
│   │   │   ├── sparkline.tsx
│   │   │   ├── area-trend.tsx
│   │   │   ├── dual-trend.tsx
│   │   │   ├── stacked-bars.tsx
│   │   │   ├── combo-chart.tsx
│   │   │   └── rating-bars.tsx
│   │   ├── views/
│   │   │   ├── financial/
│   │   │   ├── technicians/
│   │   │   ├── operations/
│   │   │   ├── engagement/
│   │   │   ├── analyze/
│   │   │   └── tools/
│   │   └── admin/                       # §10.3
│   │       ├── data-table.tsx
│   │       ├── modal.tsx
│   │       └── form.tsx
│   ├── lib/
│   │   ├── hooks/                       # §7.2
│   │   │   ├── use-financial.ts
│   │   │   ├── use-technicians.ts
│   │   │   └── ...
│   │   ├── state/
│   │   │   ├── url-params.ts            # nuqs hook
│   │   │   └── prefs.ts                 # localStorage prefs
│   │   ├── charts/
│   │   │   ├── scale.ts
│   │   │   └── spark.ts
│   │   ├── format/
│   │   │   ├── money.ts                 # cents → "$142K"
│   │   │   ├── percent.ts               # bps → "42.8%"
│   │   │   └── date.ts
│   │   └── types/                       # shared types (match DATA-SPEC API)
│   └── styles/
│       ├── tokens.css                   # CSS custom properties
│       └── globals.css                  # Tailwind + tokens
├── public/
│   └── fonts/                           # Geist + Geist Mono (self-hosted)
├── tailwind.config.ts
├── next.config.ts
└── package.json
```

---

## 12. Acceptance criteria

The UI layer is "done" when all of these pass:

### Foundations
- [ ] Geist + Geist Mono self-hosted via `next/font`, no FOUT
- [ ] Design tokens in `tokens.css` match §4.1 exactly
- [ ] Tailwind theme extends tokens per §4.2
- [ ] `<Providers>` mounts React Query + nuqs adapters

### State & routing
- [ ] All tab/period/compare state reflects in URL
- [ ] Refreshing any page preserves the current view
- [ ] Sharing a URL to another user shows the same data
- [ ] Back/forward browser buttons navigate between states correctly

### Primitives
- [ ] Every component in §5.1 implemented with props matching spec
- [ ] `<Stat>` renders correctly for money, percent, count, seconds units
- [ ] `<DeltaPill>` handles null/undefined previous value (renders nothing)
- [ ] `<Skeleton>` shapes match each use case

### Views
- [ ] Every view in §5.3–5.8 renders correctly with live API data
- [ ] Every view has working loading, error, and empty states
- [ ] Compare mode works on Financial, Technicians, Operations
- [ ] Compare mode toggle persists in URL
- [ ] Year switcher (ly vs ly2) only appears when compare is on
- [ ] Sub-tabs work on Operations (Call Center / Memberships) and Engagement (Reviews / Top Performers)

### Charts
- [ ] All 6 primitives in §6.2 implemented
- [ ] All charts use tabular-nums
- [ ] Axis labels in Geist Mono at 11px
- [ ] Hover overlays work on desktop, touch overlays work on mobile
- [ ] Compare mode charts overlay LY correctly
- [ ] No chart animations on mount (verify no sweep-in)

### TV display
- [ ] `/display?token=xyz` authenticates via TV token
- [ ] Rotation cycles through configured sequence
- [ ] Prefetch of next view works (verify in network tab)
- [ ] Display variant scales type up correctly
- [ ] Interactive controls hidden in display mode
- [ ] Error in one view skips to next instead of crashing
- [ ] Soft reload fires every 4 hours
- [ ] 1080p TV and 4K TV both render well

### Admin
- [ ] All 7 admin pages implemented
- [ ] Users CRUD works end-to-end
- [ ] Targets CRUD supports date-range targets (not monthly-only)
- [ ] TV token management: create, edit sequence, revoke
- [ ] Sync status page shows live data, manual trigger works
- [ ] All admin pages use same primitives as dashboard

### Responsive
- [ ] Every view works at 375px (iPhone SE)
- [ ] Every view works at 768px (iPad)
- [ ] Every view works at 1440px (MacBook)
- [ ] Every view works at 3840px (4K TV in display mode)
- [ ] Tables convert to cards on `sm` breakpoint
- [ ] Nav becomes drawer on `sm`
- [ ] Touch targets ≥ 44px on `sm`

### Quality
- [ ] Lighthouse score: Performance ≥ 90, Accessibility ≥ 95
- [ ] No console errors on any view
- [ ] No hydration warnings
- [ ] Bundle size: initial JS < 200KB gzipped, per-route < 50KB gzipped

---

## Appendix A: Formatter conventions

```ts
// src/lib/format/money.ts

export function fmtMoney(cents: number, opts?: { abbreviate?: boolean; cents?: boolean }): string {
  const dollars = cents / 100;
  if (opts?.abbreviate !== false && Math.abs(dollars) >= 1000) {
    if (Math.abs(dollars) >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1)}M`;
    return `$${(dollars / 1000).toFixed(0)}K`;
  }
  return `$${dollars.toLocaleString('en-US', { minimumFractionDigits: opts?.cents ? 2 : 0 })}`;
}

// src/lib/format/percent.ts

export function fmtPercent(bps: number, opts?: { decimals?: number }): string {
  return `${(bps / 100).toFixed(opts?.decimals ?? 1)}%`;
}

// src/lib/format/date.ts

export function fmtAsOf(iso: string): string {
  // "Apr 20, 2026 · 2:14 PM"
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
    hour12: true,
  }).replace(',', ',').replace(' at ', ' · ');
}
```

## Appendix B: Component naming conventions

- **PascalCase** for component names (`FinancialHero`)
- **kebab-case** for file names (`financial-hero.tsx`)
- **camelCase** for props
- **Props interfaces** named `<Component>Props` (`FinancialHeroProps`)
- **Event handlers** named `on<Event>` (`onTabChange`, `onCompareToggle`)
- Internal helpers prefixed `_` if not exported

## Appendix C: Lucide icon mapping

Reserved icons per use case — consistency matters:

| Use | Icon |
|---|---|
| Refresh | `RefreshCw` |
| Live indicator | (custom SVG dot, not lucide) |
| Sort | `ChevronsUpDown`, `ChevronUp`, `ChevronDown` |
| Settings | `Settings` |
| User | `User` |
| Admin | `Shield` |
| Target | `Target` |
| TV | `Monitor` |
| Success | `CircleCheck` |
| Error | `CircleX` |
| Warning | `CircleAlert` |
| Delta up | (custom triangle in DeltaPill, not lucide) |
| Delta down | (custom triangle in DeltaPill, not lucide) |
| Open external | `ExternalLink` |
| Close modal | `X` |
| Menu (mobile) | `Menu` |
