import type { TechniciansResponse, CompareValue } from '@/lib/types/kpi';
import { fmtMoney } from '@/lib/format/money';
import type { Insight } from './financial';

function baseline(v: CompareValue, mode: 'ly' | 'ly2'): number | undefined {
  if (mode === 'ly2') return v.ly2 ?? v.ly ?? v.prev;
  return v.ly ?? v.prev;
}

export function technicianInsights(data: TechniciansResponse, mode: 'ly' | 'ly2'): Insight[] {
  const out: Insight[] = [];
  const t = data.team;

  // 1. Team revenue vs baseline
  const rev = t.revenue;
  const lyRev = baseline(rev, mode);
  if (lyRev !== undefined && lyRev !== 0) {
    const pct = ((rev.value - lyRev) / lyRev) * 100;
    out.push({
      tone: pct >= 0 ? 'up' : 'down',
      title: `Team revenue ${pct >= 0 ? 'up' : 'down'} ${Math.abs(pct).toFixed(1)}% vs ${mode === 'ly2' ? '2 years ago' : 'last year'}`,
      sub: `${fmtMoney(rev.value)} now · ${fmtMoney(lyRev)} then`,
    });
  }

  // 2. Close rate
  const cr = t.closeRate;
  const lyCr = baseline(cr, mode);
  if (lyCr !== undefined) {
    const pts = (cr.value - lyCr) / 100;
    if (Math.abs(pts) >= 0.5) {
      out.push({
        tone: pts >= 0 ? 'up' : 'down',
        title: `Close rate ${pts >= 0 ? '+' : ''}${pts.toFixed(1)} pts`,
        sub: `${(cr.value / 100).toFixed(1)}% team avg · ${(lyCr / 100).toFixed(1)}% prior`,
      });
    }
  }

  // 3. Biggest individual gainer by revenue
  if (out.length < 3) {
    const deltas = data.technicians
      .filter((tech) => tech.ly !== undefined && tech.ly !== 0)
      .map((tech) => ({
        tech,
        pct: ((tech.revenue - (tech.ly ?? 0)) / (tech.ly || 1)) * 100,
      }))
      .sort((a, b) => b.pct - a.pct);
    const best = deltas[0];
    if (best && best.pct >= 5) {
      out.push({
        tone: 'up',
        title: `${best.tech.name} up ${best.pct.toFixed(1)}% vs ${mode === 'ly2' ? '2 years ago' : 'last year'}`,
        sub: `${fmtMoney(best.tech.revenue)} this period · was ${fmtMoney(best.tech.ly ?? 0)}`,
      });
    }
  }

  return out.slice(0, 3);
}
