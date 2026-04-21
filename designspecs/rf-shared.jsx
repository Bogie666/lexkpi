/* global React */
// Shared components used across all Refined-direction tab views

const RU = window.KPI_UTILS;

function DeltaPill({ cur, prev, suffix = 'vs last', fmt }) {
  const d = RU.pctChange(cur, prev);
  const up = d >= 0;
  return (
    <span className={`rf-delta ${up ? 'up' : 'down'}`}>
      <span className="rf-delta-arrow">{up ? '▲' : '▼'}</span>
      {Math.abs(d).toFixed(1)}%
    </span>
  );
}

function Sparkline({ values, w = 100, h = 28, chart = 'area', up = true }) {
  const color = up ? 'var(--accent)' : 'var(--danger)';
  if (chart === 'bars') {
    const min = Math.min(...values), max = Math.max(...values), range = max - min || 1;
    const bw = w / values.length * 0.75;
    return (
      <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} style={{display:'block'}}>
        {values.map((v,i)=>{
          const bh = ((v-min)/range) * (h-2) + 2;
          return <rect key={i} x={i*(w/values.length)+1} y={h-bh} width={bw} height={bh} fill={color} rx="0.5"/>;
        })}
      </svg>
    );
  }
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} style={{display:'block'}}>
      {chart !== 'lines' && <path d={RU.sparkArea(values, w, h)} fill={color} opacity="0.15"/>}
      <path d={RU.sparkPath(values, w, h)} fill="none" stroke={color} strokeWidth="1.5"/>
    </svg>
  );
}

function KpiCard({ label, value, fmt, k }) {
  const fmtFn = fmt || (v => v);
  return (
    <div className="rf-kpi">
      <div className="rf-kpi-label">{label}</div>
      <div className="rf-kpi-value">{fmtFn(k.value)}</div>
      {k.prev !== undefined && <DeltaPill cur={k.value} prev={k.prev}/>}
    </div>
  );
}

function SectionHead({ eyebrow, title, right }) {
  return (
    <div className="rf-head">
      <div>
        {eyebrow && <div className="rf-eyebrow">{eyebrow}</div>}
        <h1 className="rf-title">{title}</h1>
      </div>
      {right}
    </div>
  );
}

function PeriodTabs({ options = ['Today','MTD','QTD','YTD','Last 30'], active = 'MTD' }) {
  return (
    <div className="rf-period">
      {options.map(p => (
        <button key={p} className={p===active?'on':''}>{p}</button>
      ))}
    </div>
  );
}

Object.assign(window, { RF: { DeltaPill, Sparkline, KpiCard, SectionHead, PeriodTabs, U: RU } });
