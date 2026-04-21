/**
 * Pure fn: turn a FinancialResponse into 0–3 human-readable compare callouts.
 * Ported from designspecs/compare.jsx `financialInsights`. Values adjusted for the
 * real API shape (cents / bps / count) — no UI knowledge.
 */
import type { FinancialResponse, CompareValue } from '@/lib/types/kpi';
import { fmtMoney } from '@/lib/format/money';

export type InsightTone = 'up' | 'down' | 'neutral';

export interface Insight {
  tone: InsightTone;
  title: string;
  sub: string;
}

function baseline(v: CompareValue, mode: 'ly' | 'ly2'): number | undefined {
  if (mode === 'ly2') return v.ly2 ?? v.ly ?? v.prev;
  return v.ly ?? v.prev;
}

export function financialInsights(data: FinancialResponse, mode: 'ly' | 'ly2'): Insight[] {
  const out: Insight[] = [];

  // 1. Total revenue vs baseline
  const cur = data.total.revenue.value;
  const lyTotal = baseline(data.total.revenue, mode);
  if (lyTotal !== undefined && lyTotal !== 0) {
    const pct = ((cur - lyTotal) / lyTotal) * 100;
    if (Math.abs(pct) >= 3) {
      out.push({
        tone: pct >= 0 ? 'up' : 'down',
        title: `Total revenue ${pct >= 0 ? 'up' : 'down'} ${Math.abs(pct).toFixed(1)}% vs ${mode === 'ly2' ? '2 years ago' : 'last year'}`,
        sub: `${fmtMoney(cur)} this period · ${fmtMoney(lyTotal)} prior`,
      });
    }
  }

  // 2. Biggest upside + downside department
  const deltas = data.departments
    .map((d) => {
      const base = baseline(d.revenue, mode);
      if (base === undefined || base === 0) return null;
      const abs = d.revenue.value - base;
      const pct = (abs / base) * 100;
      return { d, abs, pct };
    })
    .filter((x): x is { d: (typeof data.departments)[number]; abs: number; pct: number } => x !== null);

  const up = deltas.slice().sort((a, b) => b.pct - a.pct)[0];
  const dn = deltas.slice().sort((a, b) => a.pct - b.pct)[0];

  if (up && up.pct >= 5) {
    out.push({
      tone: 'up',
      title: `${up.d.name} leading: +${up.pct.toFixed(1)}% vs ${mode === 'ly2' ? '2 years ago' : 'last year'}`,
      sub: `${fmtMoney(up.d.revenue.value)} this period · +${fmtMoney(Math.abs(up.abs))}`,
    });
  }

  if (dn && dn.pct < 0 && dn.d.code !== up?.d.code && out.length < 3) {
    out.push({
      tone: 'down',
      title: `${dn.d.name} behind: ${dn.pct.toFixed(1)}% vs ${mode === 'ly2' ? '2 years ago' : 'last year'}`,
      sub: `${fmtMoney(dn.d.revenue.value)} this period · ${fmtMoney(dn.abs)}`,
    });
  }

  // 3. Close rate if we still have room
  if (out.length < 3) {
    const cr = data.kpis.closeRate;
    const crLy = baseline(cr, mode);
    if (crLy !== undefined) {
      const pts = (cr.value - crLy) / 100; // bps -> pts
      if (Math.abs(pts) >= 1.5) {
        out.push({
          tone: pts >= 0 ? 'up' : 'down',
          title: `Close rate ${pts >= 0 ? 'up' : 'down'} ${Math.abs(pts).toFixed(1)} pts`,
          sub: `${(cr.value / 100).toFixed(1)}% now · ${(crLy / 100).toFixed(1)}% prior`,
        });
      }
    }
  }

  return out.slice(0, 3);
}
