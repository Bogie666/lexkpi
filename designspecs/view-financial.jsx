/* global React */
// Direction A — Financial view (refactored to use RF.*)

const FinU = window.RF.U;
const { DeltaPill: FDelta, Sparkline: FSpark, KpiCard, SectionHead: FHead, PeriodTabs: FPeriod } = window.RF;

function FinancialView({ data, density, layout, chart, accent, theme, compareOn, compareMode }) {
  const totalPct = FinU.pctOf(data.total.revenue, data.total.target);
  const cmpMode = compareMode || 'ly';

  // Resolve LY/LY2 total based on current period choice (hardcoded MTD here;
  // the period tabs drive this in the real dashboard)
  const totalLy = cmpMode === 'ly2' ? data.total.ly2 : data.total.ly;

  return (
    <>
      <FHead eyebrow="Financial" title="Revenue" right={
        <div className="rf-head-meta">
          <FPeriod active="MTD"/>
          <div className="rf-asof">Updated {data.asOf}</div>
        </div>
      }/>

      {compareOn && (
        <window.CMP.CompareBanner
          insights={window.CMP.financialInsights(data, cmpMode)}
          mode={cmpMode}
        />
      )}

      <div className="rf-hero">
        <div className="rf-hero-main">
          <div className="rf-hero-label">Total revenue · {data.period}</div>
          <div className="rf-hero-number">{FinU.fmtMoney(data.total.revenue, false)}</div>
          <div className="rf-hero-meta">
            <span>{FinU.fmtMoney(data.total.target, false)} target</span>
            <span className="rf-dot"/>
            <span className="rf-hero-pct">{totalPct.toFixed(1)}% to goal</span>
            <span className="rf-dot"/>
            {compareOn ? (
              <>
                <window.CMP.ComparePill cur={data.total.revenue} comp={totalLy} money/>
                <span className="rf-muted"> vs {cmpMode === 'ly2' ? 'Apr 2024' : 'Apr 2025'} · was {FinU.fmtMoney(totalLy, false)}</span>
              </>
            ) : (
              <>
                <FDelta cur={data.total.revenue} prev={data.total.previousPeriod}/>
                <span className="rf-muted"> vs last month</span>
              </>
            )}
          </div>
        </div>
        <div className="rf-hero-chart">
          {compareOn
            ? <>
                <window.CMP.DualTrend data={data.trend} accent={accent} mode={cmpMode}/>
                <window.CMP.TrendLegend mode={cmpMode}/>
              </>
            : <FinTrend data={data.trend} chart={chart} accent={accent}/>
          }
        </div>
      </div>

      <div className="rf-kpis">
        {compareOn ? (
          <>
            <window.CMP.CompareTile label="Close rate"    cur={data.kpis.closeRate.value}     compKpi={data.kpis.closeRate}     mode={cmpMode} fmt={v=>v.toFixed(1)+'%'}/>
            <window.CMP.CompareTile label="Avg ticket"    cur={data.kpis.avgTicket.value}     compKpi={data.kpis.avgTicket}     mode={cmpMode} fmt={v=>'$'+v.toLocaleString()}/>
            <window.CMP.CompareTile label="Opportunities" cur={data.kpis.opportunities.value} compKpi={data.kpis.opportunities} mode={cmpMode} fmt={v=>v.toLocaleString()}/>
            <window.CMP.CompareTile label="Memberships"   cur={data.kpis.memberships.value}   compKpi={data.kpis.memberships}   mode={cmpMode} fmt={v=>v.toLocaleString()}/>
          </>
        ) : (
          <>
            <KpiCard label="Close rate"    k={data.kpis.closeRate}     fmt={v=>v.toFixed(1)+'%'}/>
            <KpiCard label="Avg ticket"    k={data.kpis.avgTicket}     fmt={v=>'$'+v.toLocaleString()}/>
            <KpiCard label="Opportunities" k={data.kpis.opportunities} fmt={v=>v.toLocaleString()}/>
            <KpiCard label="Memberships"   k={data.kpis.memberships}   fmt={v=>v.toLocaleString()}/>
          </>
        )}
      </div>

      {layout === 'table' && <FinTable data={data} chart={chart} compareOn={compareOn} cmpMode={cmpMode}/>}
      {layout === 'cards' && <FinCards data={data} chart={chart} compareOn={compareOn} cmpMode={cmpMode}/>}
      {layout === 'split' && (
        <div className="rf-split">
          <FinTable data={data} chart={chart} compareOn={compareOn} cmpMode={cmpMode}/>
          <FinPotential data={data}/>
        </div>
      )}
    </>
  );
}

function FinTrend({ data, chart, accent }) {
  const w = 520, h = 140, pad = 8;
  const actuals = data.map(d=>d.actual);
  const targets = data.map(d=>d.target);
  const max = Math.max(...actuals, ...targets);
  const x = i => pad + (i / (data.length-1)) * (w - pad*2);
  const y = v => h - pad - (v / max) * (h - pad*2);
  const actualPath = data.map((d,i)=>(i?'L':'M')+x(i).toFixed(1)+' '+y(d.actual).toFixed(1)).join(' ');
  const targetPath = data.map((d,i)=>(i?'L':'M')+x(i).toFixed(1)+' '+y(d.target).toFixed(1)).join(' ');
  const areaPath = actualPath + ` L${x(data.length-1).toFixed(1)} ${h-pad} L${x(0).toFixed(1)} ${h-pad} Z`;
  if (chart === 'bars') {
    const bw = (w - pad*2) / data.length * 0.7;
    return (
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h}>
        {data.map((d,i)=>(
          <g key={i}>
            <rect x={x(i)-bw/2} y={y(d.target)} width={bw} height={h-pad-y(d.target)} fill="currentColor" opacity="0.08" rx="1"/>
            <rect x={x(i)-bw/2} y={y(d.actual)} width={bw} height={h-pad-y(d.actual)} fill={accent} rx="1"/>
          </g>
        ))}
      </svg>
    );
  }
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h}>
      {chart !== 'lines' && <path d={areaPath} fill={accent} opacity="0.12"/>}
      <path d={targetPath} fill="none" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.5" strokeDasharray="3 3"/>
      <path d={actualPath} fill="none" stroke={accent} strokeWidth="2"/>
      <circle cx={x(data.length-1)} cy={y(actuals[actuals.length-1])} r="4" fill={accent}/>
    </svg>
  );
}

function FinTable({ data, chart, compareOn, cmpMode }) {
  const headCls = compareOn ? 'rf-table-head rf-lb-cmp-grid' : 'rf-table-head';
  const rowCls = compareOn ? 'rf-row rf-lb-cmp-grid' : 'rf-row';
  return (
    <div className="rf-table-wrap">
      <div className={headCls}>
        <div>Department</div>
        <div className="rf-num">Revenue</div>
        {compareOn && <div className="rf-num">Last year</div>}
        {!compareOn && <div className="rf-num">Target</div>}
        <div className="rf-num">% Goal</div>
        <div className="rf-num">{compareOn ? 'Δ vs LY' : 'vs Last'}</div>
        <div>Trend</div>
        {compareOn && <div/>}
      </div>
      {data.departments.map(d => {
        const pct = FinU.pctOf(d.revenue, d.target);
        const chg = FinU.pctChange(d.revenue, d.previousPeriod);
        const ly = cmpMode === 'ly2' ? d.ly2 : d.ly;
        return (
          <div key={d.id} className={rowCls}>
            <div className="rf-dept-name"><span className={`rf-swatch d-${d.id}`}/>{d.name}</div>
            <div className="rf-num rf-bold">{FinU.fmtMoney(d.revenue, false)}</div>
            {compareOn && <div className="rf-num rf-muted">{FinU.fmtMoney(ly, false)}</div>}
            {!compareOn && <div className="rf-num rf-muted">{FinU.fmtMoney(d.target, false)}</div>}
            <div className="rf-num">
              <div className="rf-bar"><div className="rf-bar-fill" style={{width: Math.min(pct,100)+'%'}}/></div>
              <span className="rf-pct-label">{pct.toFixed(0)}%</span>
            </div>
            <div className="rf-num">
              {compareOn
                ? <window.CMP.ComparePill cur={d.revenue} comp={ly} money size="sm"/>
                : <FDelta cur={d.revenue} prev={d.previousPeriod}/>}
            </div>
            <div><FSpark values={d.spark} w={100} h={28} chart={chart} up={chg>=0}/></div>
            {compareOn && <div/>}
          </div>
        );
      })}
      <div className={rowCls + ' rf-total'}>
        <div className="rf-dept-name">Total</div>
        <div className="rf-num rf-bold">{FinU.fmtMoney(data.total.revenue, false)}</div>
        {compareOn && <div className="rf-num rf-muted">{FinU.fmtMoney(cmpMode==='ly2'?data.total.ly2:data.total.ly, false)}</div>}
        {!compareOn && <div className="rf-num rf-muted">{FinU.fmtMoney(data.total.target, false)}</div>}
        <div className="rf-num">
          <div className="rf-bar"><div className="rf-bar-fill" style={{width: Math.min(FinU.pctOf(data.total.revenue, data.total.target),100)+'%'}}/></div>
          <span className="rf-pct-label">{FinU.pctOf(data.total.revenue, data.total.target).toFixed(0)}%</span>
        </div>
        <div className="rf-num">
          {compareOn
            ? <window.CMP.ComparePill cur={data.total.revenue} comp={cmpMode==='ly2'?data.total.ly2:data.total.ly} money size="sm"/>
            : <FDelta cur={data.total.revenue} prev={data.total.previousPeriod}/>}
        </div>
        <div/>
        {compareOn && <div/>}
      </div>
    </div>
  );
}

function FinCards({ data, chart, compareOn, cmpMode }) {
  return (
    <div className="rf-cards">
      {data.departments.map(d => {
        const pct = FinU.pctOf(d.revenue, d.target);
        const chg = FinU.pctChange(d.revenue, d.previousPeriod);
        const ly = cmpMode === 'ly2' ? d.ly2 : d.ly;
        return (
          <div key={d.id} className="rf-card">
            <div className="rf-card-head">
              <span className={`rf-swatch d-${d.id}`}/>
              <span className="rf-card-name">{d.name}</span>
              {compareOn
                ? <window.CMP.ComparePill cur={d.revenue} comp={ly} money size="sm"/>
                : <FDelta cur={d.revenue} prev={d.previousPeriod}/>}
            </div>
            <div className="rf-card-value">{FinU.fmtMoney(d.revenue, false)}</div>
            <div className="rf-card-sub">
              <span>{compareOn ? `Last year ${FinU.fmtMoney(ly)}` : `Target ${FinU.fmtMoney(d.target)}`}</span>
              <span className="rf-pct-label">{pct.toFixed(0)}%</span>
            </div>
            <div className="rf-bar"><div className="rf-bar-fill" style={{width: Math.min(pct,100)+'%'}}/></div>
            <div className="rf-card-spark"><FSpark values={d.spark} w={240} h={36} chart={chart} up={chg>=0}/></div>
          </div>
        );
      })}
    </div>
  );
}

function FinPotential({ data }) {
  return (
    <div className="rf-potential">
      <div className="rf-pot-head">
        <div className="rf-pot-label">Potential revenue</div>
        <div className="rf-pot-hint">Unsold estimates · realistic</div>
      </div>
      <div className="rf-pot-value">{FinU.fmtMoney(data.potential.total, false)}</div>
      <div className="rf-pot-list">
        {data.potential.byDept.map(d => (
          <div key={d.id} className="rf-pot-row">
            <span className={`rf-swatch d-${d.id}`}/>
            <span className="rf-pot-name">{d.name}</span>
            <span className="rf-pot-num">{FinU.fmtMoney(d.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

window.FinancialView = FinancialView;
