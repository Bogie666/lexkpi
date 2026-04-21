/* global React */
// YoY comparison primitives — used across Financial, Technicians, Operations views.

const CU = window.KPI_UTILS;

// Resolve the comparison baseline value from a KPI object { value, prev, ly, ly2 }
// or from named fields on a flat record (e.g. {revenue, ly, ly2}).
function basis(cur, ly, ly2, mode) {
  if (mode === 'ly2') return ly2;
  if (mode === 'prev') return cur; // no-op, callers won't call
  return ly;
}

function compareValues(cur, comp) {
  if (comp == null || cur == null) return null;
  const abs = cur - comp;
  const pct = comp === 0 ? 0 : (abs / comp) * 100;
  return { abs, pct, up: abs >= 0 };
}

// <ComparePill> — pill used in compare mode. Shows +$142K · +12.4% (or absolute only for %/counts).
function ComparePill({ cur, comp, money, percentUnit, signed = true, size = 'md' }) {
  const d = compareValues(cur, comp);
  if (!d) return null;
  const up = d.up;
  const absText = money
    ? CU.fmtMoney(Math.abs(d.abs), false)
    : percentUnit
      ? `${Math.abs(d.abs).toFixed(1)}pt`
      : Math.abs(d.abs).toLocaleString();
  const sign = up ? '+' : '−';
  const pctText = `${sign}${Math.abs(d.pct).toFixed(1)}%`;
  return (
    <span className={`rf-cmp rf-cmp-${up ? 'up' : 'down'} rf-cmp-${size}`}>
      <span className="rf-cmp-arrow">{up ? '▲' : '▼'}</span>
      <span className="rf-cmp-abs">{sign}{signed ? '' : ''}{money ? absText : absText}</span>
      <span className="rf-cmp-sep">·</span>
      <span className="rf-cmp-pct">{pctText}</span>
    </span>
  );
}

// Helper to derive LY value from a KPI: prefer k.ly, fall back to k.prev so old shape works too.
function lyOf(k, mode = 'ly') {
  if (!k) return null;
  if (mode === 'ly2') return k.ly2 ?? k.ly ?? k.prev;
  return k.ly ?? k.prev;
}

function fmtPeriodLabel(period, mode, year = 2026) {
  const y = mode === 'ly2' ? year - 2 : year - 1;
  return `vs ${period} ${y}`;
}

// Generate up to 3 human-readable callouts from the Financial data for the banner.
function financialInsights(data, mode) {
  const out = [];
  const periods = data.total.periods || { MTD: { cur: data.total.revenue, ly: data.total.ly || data.total.previousPeriod, ly2: data.total.ly2 || data.total.previousPeriod } };
  const ly = periods.MTD.ly;
  const cur = periods.MTD.cur;
  const totalPct = ((cur - ly) / ly) * 100;
  if (Math.abs(totalPct) >= 3) {
    out.push({
      tone: totalPct >= 0 ? 'up' : 'down',
      title: `Total revenue ${totalPct >= 0 ? 'up' : 'down'} ${Math.abs(totalPct).toFixed(1)}% vs last year`,
      sub: `${CU.fmtMoney(cur, false)} this MTD · ${CU.fmtMoney(ly, false)} last year`,
    });
  }

  // Biggest mover in departments
  const deltas = data.departments.map(d => {
    const cmp = lyOf({ ly: d.ly, ly2: d.ly2, prev: d.previousPeriod }, mode);
    return { d, pct: ((d.revenue - cmp) / cmp) * 100, abs: d.revenue - cmp };
  });
  const up = [...deltas].sort((a,b) => b.pct - a.pct)[0];
  const dn = [...deltas].sort((a,b) => a.pct - b.pct)[0];
  if (up && up.pct >= 5) {
    out.push({
      tone: 'up',
      title: `${up.d.name} leading: +${up.pct.toFixed(1)}% vs last year`,
      sub: `${CU.fmtMoney(up.d.revenue, false)} this period · +${CU.fmtMoney(Math.abs(up.abs))}`,
    });
  }
  if (dn && dn.pct < 0 && dn.d.id !== up?.d.id) {
    out.push({
      tone: 'down',
      title: `${dn.d.name} behind: ${dn.pct.toFixed(1)}% vs last year`,
      sub: `${CU.fmtMoney(dn.d.revenue, false)} this period · ${CU.fmtMoney(dn.abs)}`,
    });
  }
  // Close rate as tertiary
  const cr = data.kpis.closeRate;
  const crLy = lyOf(cr, mode);
  const crDelta = cr.value - crLy;
  if (Math.abs(crDelta) >= 1.5 && out.length < 3) {
    out.push({
      tone: crDelta >= 0 ? 'up' : 'down',
      title: `Close rate ${crDelta >= 0 ? 'up' : 'down'} ${Math.abs(crDelta).toFixed(1)}pt`,
      sub: `${cr.value.toFixed(1)}% now · ${crLy.toFixed(1)}% last year`,
    });
  }
  return out.slice(0, 3);
}

function CompareBanner({ insights, mode, onClose }) {
  if (!insights || !insights.length) return null;
  return (
    <div className="rf-banner">
      <div className="rf-banner-head">
        <span className="rf-banner-eye">Auto-insights</span>
        <span className="rf-banner-mode">vs {mode === 'ly2' ? '2 years ago' : 'last year'}</span>
      </div>
      <div className="rf-banner-items">
        {insights.map((ins, i) => (
          <div key={i} className={`rf-banner-item rf-banner-${ins.tone}`}>
            <div className="rf-banner-dot"/>
            <div>
              <div className="rf-banner-title">{ins.title}</div>
              <div className="rf-banner-sub">{ins.sub}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Compact "tinted" tile used instead of rf-kpi when compare mode is on.
// Tint = subtle bg color based on up/down; includes both value + compare pill.
function CompareTile({ label, cur, compKpi, fmt, mode }) {
  const fmtFn = fmt || (v => v);
  const comp = lyOf(compKpi, mode);
  const d = compareValues(cur, comp);
  const tone = d ? (d.up ? 'up' : 'down') : 'neutral';
  const isPct = (compKpi?.unit === '%');
  return (
    <div className={`rf-kpi rf-kpi-cmp rf-kpi-${tone}`}>
      <div className="rf-kpi-label">{label}</div>
      <div className="rf-kpi-value">{fmtFn(cur)}</div>
      <div className="rf-kpi-cmp-row">
        <ComparePill cur={cur} comp={comp} money={compKpi?.unit === '$'} percentUnit={isPct} size="sm"/>
        <span className="rf-kpi-ly">was {fmtFn(comp)}</span>
      </div>
    </div>
  );
}

// Full-width dual-line trend chart: this year solid accent, last year ghosted.
function DualTrend({ data, accent, keyCur = 'actual', keyLy = 'ly', keyLy2 = 'ly2', mode = 'ly', showTarget = true }) {
  const w = 520, h = 160, pad = 8;
  const vals = data.flatMap(d => [d[keyCur], d[keyLy], d[keyLy2] ?? 0, d.target ?? 0]);
  const max = Math.max(...vals);
  const x = i => pad + (i / (data.length - 1)) * (w - pad * 2);
  const y = v => h - pad - (v / max) * (h - pad * 2);
  const line = (key) => data.map((d, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(d[key] ?? 0).toFixed(1)).join(' ');
  const areaCur = line(keyCur) + ` L${x(data.length-1).toFixed(1)} ${h-pad} L${x(0).toFixed(1)} ${h-pad} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h}>
      <path d={areaCur} fill={accent} opacity="0.10"/>
      {showTarget && <path d={line('target')} fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1.5" strokeDasharray="3 3"/>}
      {mode === 'ly2' && (
        <path d={line(keyLy2)} fill="none" stroke="currentColor" strokeOpacity="0.30" strokeWidth="1.5" strokeDasharray="2 4"/>
      )}
      <path d={line(keyLy)} fill="none" stroke="currentColor" strokeOpacity="0.55" strokeWidth="1.8"/>
      <path d={line(keyCur)} fill="none" stroke={accent} strokeWidth="2.4"/>
      <circle cx={x(data.length-1)} cy={y(data[data.length-1][keyCur])} r="4" fill={accent}/>
      <circle cx={x(data.length-1)} cy={y(data[data.length-1][keyLy])} r="3" fill="currentColor" opacity="0.55"/>
    </svg>
  );
}

function TrendLegend({ mode }) {
  return (
    <div className="rf-legend">
      <span><span className="rf-legend-sw" style={{background:'var(--accent)'}}/>This year</span>
      <span><span className="rf-legend-sw rf-legend-ly"/>Last year</span>
      {mode === 'ly2' && <span><span className="rf-legend-sw rf-legend-ly2"/>2 years ago</span>}
      <span><span className="rf-legend-sw rf-legend-target"/>Target</span>
    </div>
  );
}

window.CMP = { ComparePill, CompareBanner, CompareTile, DualTrend, TrendLegend, financialInsights, lyOf, compareValues, fmtPeriodLabel };
