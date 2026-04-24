import type { CallCenterResponse, MembershipsResponse, CompareValue } from '@/lib/types/kpi';
import type { Insight } from './financial';

function baseline(v: CompareValue, mode: 'ly' | 'ly2'): number | undefined {
  if (mode === 'ly2') return v.ly2 ?? v.ly ?? v.prev;
  return v.ly ?? v.prev;
}

export function callCenterInsights(data: CallCenterResponse, mode: 'ly' | 'ly2'): Insight[] {
  const out: Insight[] = [];
  const label = mode === 'ly2' ? '2 years ago' : 'last year';

  const b = data.kpis.booked;
  const lyBooked = baseline(b, mode);
  if (lyBooked !== undefined && lyBooked !== 0) {
    const pct = ((b.value - lyBooked) / lyBooked) * 100;
    out.push({
      tone: pct >= 0 ? 'up' : 'down',
      title: `Booked calls ${pct >= 0 ? 'up' : 'down'} ${Math.abs(pct).toFixed(1)}% vs ${label}`,
      sub: `${b.value.toLocaleString()} today · ${lyBooked.toLocaleString()} then`,
    });
  }

  const r = data.kpis.bookRate;
  const lyRate = baseline(r, mode);
  if (lyRate !== undefined) {
    const pts = (r.value - lyRate) / 100;
    if (Math.abs(pts) >= 0.5) {
      out.push({
        tone: pts >= 0 ? 'up' : 'down',
        title: `Booking rate ${pts >= 0 ? '+' : ''}${pts.toFixed(1)} pts`,
        sub: `${(r.value / 100).toFixed(1)}% now · ${(lyRate / 100).toFixed(1)}% prior`,
      });
    }
  }

  const w = data.kpis.avgCallTime;
  const lyWait = baseline(w, mode);
  if (lyWait !== undefined) {
    const delta = w.value - lyWait; // lower is generally better
    if (Math.abs(delta) >= 3 && out.length < 3) {
      out.push({
        tone: delta <= 0 ? 'up' : 'down',
        title: `Avg call time ${delta <= 0 ? 'down' : 'up'} ${Math.abs(delta)}s`,
        sub: `${w.value}s now · ${lyWait}s prior`,
      });
    }
  }

  return out.slice(0, 3);
}

export function membershipsInsights(data: MembershipsResponse, mode: 'ly' | 'ly2'): Insight[] {
  const out: Insight[] = [];
  const ly = mode === 'ly2' ? data.ly2 : data.ly;
  if (!ly) return out;
  const label = mode === 'ly2' ? '2 years ago' : 'last year';

  const delta = data.active - ly.active;
  const pct = ly.active === 0 ? 0 : (delta / ly.active) * 100;
  out.push({
    tone: delta >= 0 ? 'up' : 'down',
    title: `${Math.abs(delta).toLocaleString()} ${delta >= 0 ? 'more' : 'fewer'} members than ${label}`,
    sub: `${data.active.toLocaleString()} now · ${ly.active.toLocaleString()} then · ${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`,
  });

  const newDelta = data.newMonth - ly.newMonth;
  out.push({
    tone: newDelta >= 0 ? 'up' : 'down',
    title: `New signups ${newDelta >= 0 ? '+' : ''}${newDelta} vs ${label}`,
    sub: `${data.newMonth} this month · ${ly.newMonth} prior`,
  });

  const churnDelta = data.churnMonth - ly.churnMonth;
  if (Math.abs(churnDelta) >= 3) {
    out.push({
      tone: churnDelta <= 0 ? 'up' : 'down',
      title: `Churn ${churnDelta <= 0 ? 'down' : 'up'} ${Math.abs(churnDelta)} vs ${label}`,
      sub: `${data.churnMonth} cancels · ${ly.churnMonth} prior`,
    });
  }

  return out.slice(0, 3);
}
