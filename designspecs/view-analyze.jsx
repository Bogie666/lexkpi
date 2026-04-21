/* global React */
const AU = window.RF.U;
const { DeltaPill: ADelta, Sparkline: ASpark, KpiCard: AKpi, SectionHead: AHead, PeriodTabs: APeriod } = window.RF;

function AnalyzeView({ data, density, layout, chart, accent, theme }) {
  return (
    <>
      <AHead eyebrow="Analyze" title="Estimate Analysis" right={
        <APeriod active="Last 12 Months" options={['MTD','Last Month','Last 6 Months','Last 12 Months','YTD']}/>
      }/>

      <div className="rf-kpis">
        <AKpi label="Opportunities"  k={data.totals.opportunities} fmt={v=>v.toLocaleString()}/>
        <AKpi label="Close rate"     k={data.totals.closeRate}     fmt={v=>v.toFixed(1)+'%'}/>
        <AKpi label="Realistic unsold" k={data.totals.unsoldRealistic} fmt={v=>AU.fmtMoney(v)}/>
        <AKpi label="Avg ticket"     k={data.totals.avgTicket}     fmt={v=>'$'+v.toLocaleString()}/>
      </div>

      <div className="rf-split">
        <div className="rf-card-full">
          <div className="rf-panel-head"><div><div className="rf-panel-title">Seasonality</div><div className="rf-panel-sub">Close rate · Avg ticket · by month</div></div></div>
          <Seasonality data={data.seasonality} accent={accent}/>
        </div>

        <div className="rf-potential">
          <div className="rf-pot-head"><div className="rf-pot-label">Tier selection</div><div className="rf-pot-hint">Which price tier customers choose</div></div>
          {data.tierSelection.map(t => (
            <div key={t.tier} className="rf-tier-row">
              <span className="rf-tier-label">{t.tier}</span>
              <div className="rf-bar"><div className="rf-bar-fill" style={{width: t.pct+'%'}}/></div>
              <span className="rf-num rf-bold">{t.pct}%</span>
            </div>
          ))}
          <div className="rf-pot-head" style={{marginTop:24}}><div className="rf-pot-label">Time to close</div></div>
          {data.timeToClose.map(t => (
            <div key={t.bucket} className="rf-tier-row">
              <span className="rf-tier-label">{t.bucket}</span>
              <div className="rf-bar"><div className="rf-bar-fill" style={{width: t.pct+'%'}}/></div>
              <span className="rf-num rf-bold">{t.pct}%</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rf-table-wrap">
        <div className="rf-table-head rf-an-grid">
          <div>Department</div>
          <div className="rf-num">Opportunities</div>
          <div className="rf-num">Close rate</div>
          <div className="rf-num">Avg ticket</div>
          <div className="rf-num">Realistic unsold</div>
        </div>
        {data.byDept.map(d => (
          <div key={d.id} className="rf-row rf-an-grid">
            <div className="rf-dept-name"><span className={`rf-swatch d-${d.id}`}/>{d.name}</div>
            <div className="rf-num rf-bold">{d.opps.toLocaleString()}</div>
            <div className="rf-num">{d.closeRate.toFixed(1)}%</div>
            <div className="rf-num rf-muted">${d.avgTicket.toLocaleString()}</div>
            <div className="rf-num rf-bold">{AU.fmtMoney(d.unsold)}</div>
          </div>
        ))}
      </div>
    </>
  );
}

function Seasonality({ data, accent }) {
  const w = 720, h = 220, pad = 32;
  const maxClose = Math.max(...data.map(d=>d.close));
  const minTick = Math.min(...data.map(d=>d.ticket));
  const maxTick = Math.max(...data.map(d=>d.ticket));
  const bw = (w - pad*2) / data.length * 0.7;
  const x = i => pad + (i/(data.length-1)) * (w - pad*2);
  const yBar = v => h - pad - (v / maxClose) * (h - pad*2);
  const yLine = v => h - pad - ((v-minTick)/(maxTick-minTick)) * (h - pad*2);
  const linePath = data.map((d,i)=>(i?'L':'M')+x(i).toFixed(1)+' '+yLine(d.ticket).toFixed(1)).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="100%">
      {data.map((d,i)=>(
        <g key={i}>
          <rect x={x(i)-bw/2} y={yBar(d.close)} width={bw} height={h-pad-yBar(d.close)} fill={accent} opacity="0.35" rx="2"/>
          <text x={x(i)} y={h-10} textAnchor="middle" fontSize="10" fill="currentColor" opacity="0.55">{d.m}</text>
        </g>
      ))}
      <path d={linePath} fill="none" stroke={accent} strokeWidth="2"/>
      {data.map((d,i)=>(
        <circle key={i} cx={x(i)} cy={yLine(d.ticket)} r="3" fill={accent}/>
      ))}
    </svg>
  );
}

window.AnalyzeView = AnalyzeView;
