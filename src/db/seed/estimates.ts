/**
 * Estimate analysis seeding — targets the mock "Analyze" totals:
 *   28,416 opportunities | 42.8% close rate | $1,842,000 unsold | $1,284 avg ticket
 * Distributed across 5 depts × 12 months using the seasonality curve.
 *
 * Rows are deterministic (seeded PRNG) so reruns produce the same output.
 */
import type { estimateAnalysis } from '@/db/schema';

type EstRow = typeof estimateAnalysis.$inferInsert;

interface DeptTargets {
  code: string;
  opps: number;
  closeRatePct: number;     // % of opps that become 'won'
  avgTicketDollars: number; // mean subtotal for 'won'
  unsoldDollars: number;    // total unsold subtotals (across unsold rows)
}

const DEPT_TARGETS: DeptTargets[] = [
  // HVAC Service (trade service work — repair, diagnose, bolt-on upsells)
  { code: 'hvac_service',     opps:  8_000, closeRatePct: 46.8, avgTicketDollars: 1_320, unsoldDollars: 520_000 },
  // HVAC Sales (equipment replacements + new-system quotes; bigger tickets, higher unsold)
  { code: 'hvac_sales',       opps:  4_408, closeRatePct: 39.2, avgTicketDollars: 7_200, unsoldDollars: 462_000 },
  // HVAC Maintenance (Cool Club, tune-ups)
  { code: 'hvac_maintenance', opps:  1_500, closeRatePct: 48.6, avgTicketDollars:   440, unsoldDollars:  22_000 },
  { code: 'plumbing',         opps:  7_214, closeRatePct: 41.8, avgTicketDollars: 1_120, unsoldDollars: 412_000 },
  { code: 'commercial',       opps:  2_412, closeRatePct: 46.1, avgTicketDollars: 2_180, unsoldDollars: 180_000 },
  { code: 'electrical',       opps:  4_882, closeRatePct: 39.4, avgTicketDollars:   980, unsoldDollars: 268_000 },
];

// Mock seasonality "close" values — used as monthly weights for distributing opps
const MONTH_WEIGHTS = [
  { m: 5,  y: 2025, w: 38 },
  { m: 6,  y: 2025, w: 41 },
  { m: 7,  y: 2025, w: 44 },
  { m: 8,  y: 2025, w: 43 },
  { m: 9,  y: 2025, w: 40 },
  { m: 10, y: 2025, w: 38 },
  { m: 11, y: 2025, w: 37 },
  { m: 12, y: 2025, w: 36 },
  { m: 1,  y: 2026, w: 39 },
  { m: 2,  y: 2026, w: 41 },
  { m: 3,  y: 2026, w: 43 },
  { m: 4,  y: 2026, w: 42.8 },
];

const TIER_WEIGHTS = [
  { tier: 'low',  pct: 21 },
  { tier: 'mid',  pct: 52 },
  { tier: 'high', pct: 27 },
];

const TIME_TO_CLOSE_WEIGHTS = [
  { bucket: 'same_day', pct: 38, minDays: 0,  maxDays: 0  },
  { bucket: 'one_to_7', pct: 44, minDays: 1,  maxDays: 7  },
  { bucket: 'over_7',   pct: 18, minDays: 8,  maxDays: 30 },
];

// Deterministic PRNG (mulberry32)
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInt(rng: () => number, minInclusive: number, maxInclusive: number): number {
  return Math.floor(rng() * (maxInclusive - minInclusive + 1)) + minInclusive;
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function isoDate(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Choose a weighted bucket from an array of { pct } entries. */
function pickWeighted<T extends { pct: number }>(rng: () => number, buckets: T[]): T {
  const roll = rng() * 100;
  let cum = 0;
  for (const b of buckets) {
    cum += b.pct;
    if (roll < cum) return b;
  }
  return buckets[buckets.length - 1];
}

export function buildEstimateRows(): EstRow[] {
  const rng = mulberry32(42);
  const rows: EstRow[] = [];
  const totalWeight = MONTH_WEIGHTS.reduce((s, m) => s + m.w, 0);

  let estimateCounter = 1_000_000;

  for (const dept of DEPT_TARGETS) {
    const wonCount = Math.round((dept.opps * dept.closeRatePct) / 100);
    const unsoldCount = dept.opps - wonCount;

    // Distribute rows across months proportional to seasonality weight.
    const oppsPerMonth = MONTH_WEIGHTS.map((m) => Math.round((m.w / totalWeight) * dept.opps));
    // Fix rounding drift so counts add back to opps
    const drift = dept.opps - oppsPerMonth.reduce((s, n) => s + n, 0);
    oppsPerMonth[oppsPerMonth.length - 1] += drift;

    // We'll walk through months, interleaving 'won' and 'unsold' to roughly
    // hit the per-dept closeRate uniformly over time.
    let remainingWon = wonCount;
    let remainingUnsold = unsoldCount;
    const wonUnsoldRatio = wonCount / dept.opps;

    // Avg unsold subtotal so the per-dept unsold total lands on target
    const avgUnsoldDollars = unsoldCount > 0 ? dept.unsoldDollars / unsoldCount : 0;

    for (let i = 0; i < MONTH_WEIGHTS.length; i++) {
      const { y, m } = MONTH_WEIGHTS[i];
      const dim = daysInMonth(y, m);
      const oppsThisMonth = oppsPerMonth[i];

      for (let j = 0; j < oppsThisMonth; j++) {
        const shouldWin =
          remainingWon > 0 &&
          (remainingUnsold === 0 || rng() < wonUnsoldRatio);

        const createdDay = randomInt(rng, 1, dim);
        const createdOn = isoDate(y, m, createdDay);

        if (shouldWin) {
          remainingWon -= 1;
          const ttc = pickWeighted(rng, TIME_TO_CLOSE_WEIGHTS);
          const daysToClose = randomInt(rng, ttc.minDays, ttc.maxDays);
          // Clamp sold date within the year-ish range
          const soldDateOffset = createdDay + daysToClose;
          const soldDate = soldDateOffset <= dim
            ? isoDate(y, m, soldDateOffset)
            : isoDate(y, m, dim);
          const tier = pickWeighted(rng, TIER_WEIGHTS);
          // Subtotal: mean × (0.75..1.25 variance)
          const variance = 0.75 + rng() * 0.5;
          const subtotal = Math.round(dept.avgTicketDollars * variance * 100);

          rows.push({
            estimateId: `E${estimateCounter++}`,
            opportunityStatus: 'won',
            soldOn: soldDate,
            createdOn,
            subtotalCents: subtotal,
            departmentCode: dept.code,
            timeToCloseDays: daysToClose,
            tierSelected: tier.tier,
            sourceReportId: 'seed',
          });
        } else {
          remainingUnsold -= 1;
          const variance = 0.7 + rng() * 0.6;
          const subtotal = Math.round(avgUnsoldDollars * variance * 100);
          rows.push({
            estimateId: `E${estimateCounter++}`,
            opportunityStatus: 'unsold',
            soldOn: null,
            createdOn,
            subtotalCents: subtotal,
            departmentCode: dept.code,
            timeToCloseDays: null,
            tierSelected: null,
            sourceReportId: 'seed',
          });
        }
      }
    }
  }

  return rows;
}
