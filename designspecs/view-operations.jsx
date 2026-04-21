/* global React */
const OU = window.RF.U;
const { DeltaPill: ODelta, Sparkline: OSpark, KpiCard: OKpi, SectionHead: OHead, PeriodTabs: OPeriod } = window.RF;

function OperationsView({ data, density, layout, chart, accent, theme, compareOn, compareMode }) {
  const { useState } = React;
  const [sub, setSub] = useState('call_center');
  const cmpMode = compareMode || 'ly';

  return (
    <>
      <OHead eyebrow="Operations" title={sub === 'call_center' ? 'Call Center' : 'Memberships'} right={
        <OPeriod active={sub==='call_center'?'Today':'MTD'} options={sub==='call_center'?['Today','Yesterday','This week','MTD']:['MTD','QTD','YTD']}/>
      }/>

      <div className="rf-subtabs">
        <button className={sub==='call_center'?'on':''} onClick={()=>setSub('call_center')}>Call Center</button>
        <button className={sub==='memberships'?'on':''} onClick={()=>setSub('memberships')}>Memberships</button>
      </div>

      {sub === 'call_center' && <CallCenter data={data.callCenter} chart={chart} accent={accent} compareOn={compareOn} cmpMode={cmpMode}/>}
      {sub === 'memberships' && <Memberships data={data.memberships} chart={chart} accent={accent} compareOn={compareOn} cmpMode={cmpMode}/>}
    </>
  );
}

function CallCenter({ data, chart, accent, compareOn, cmpMode }) {
  const fmtFn = {
    booked: v=>v.toLocaleString(),
    bookRate: v=>v.toFixed(1)+'%',
    avgWait: v=>v+'s',
    abandon: v=>v.toFixed(1)+'%',
  };

  const insights = React.useMemo(() => {
    if (!compareOn) return [];
    const ly = (k) => cmpMode === 'ly2' ? k.ly2 : k.ly;
    const items = [];
    const bDelta = ((data.booked.value - ly(data.booked)) / ly(data.booked)) * 100;
    items.push({
      tone: bDelta >= 0 ? 'up' : 'down',
      title: `Booked calls ${bDelta>=0?'up':'down'} ${Math.abs(bDelta).toFixed(1)}% vs ${cmpMode==='ly2'?'2 yrs ago':'last year'}`,
      sub: `${data.booked.value} today · ${ly(data.booked)} then`,
    });
    const rDelta = data.bookRate.value - ly(data.bookRate);
    items.push({
      tone: rDelta >= 0 ? 'up' : 'down',
      title: `Booking rate ${rDelta>=0?'+':''}${rDelta.toFixed(1)}pt`,
      sub: `${data.bookRate.value.toFixed(1)}% now · ${ly(data.bookRate).toFixed(1)}% then`,
    });
    const wDelta = data.avgWait.value - ly(data.avgWait);
    items.push({
      tone: wDelta <= 0 ? 'up' : 'down', // lower wait = better
      title: `Average wait ${wDelta<=0?'down':'up'} ${Math.abs(wDelta)}s`,
      sub: `${data.avgWait.value}s now · ${ly(data.avgWait)}s then`,
    });
    return items.slice(0, 3);
  }, [compareOn, cmpMode, data]);

  return (
    <>
      {compareOn && <window.CMP.CompareBanner insights={insights} mode={cmpMode}/>}

      <div className="rf-kpis">
        {compareOn ? (
          <>
            <window.CMP.CompareTile label="Booked today" cur={data.booked.value}      compKpi={data.booked}      mode={cmpMode} fmt={fmtFn.booked}/>
            <window.CMP.CompareTile label="Booking rate" cur={data.bookRate.value}    compKpi={data.bookRate}    mode={cmpMode} fmt={fmtFn.bookRate}/>
            <window.CMP.CompareTile label="Avg wait"     cur={data.avgWait.value}     compKpi={data.avgWait}     mode={cmpMode} fmt={fmtFn.avgWait}/>
            <window.CMP.CompareTile label="Abandon rate" cur={data.abandonRate.value} compKpi={data.abandonRate} mode={cmpMode} fmt={fmtFn.abandon}/>
          </>
        ) : (
          <>
            <OKpi label="Booked today" k={data.booked} fmt={fmtFn.booked}/>
            <OKpi label="Booking rate" k={data.bookRate} fmt={fmtFn.bookRate}/>
            <OKpi label="Avg wait"     k={data.avgWait} fmt={fmtFn.avgWait}/>
            <OKpi label="Abandon rate" k={data.abandonRate} fmt={fmtFn.abandon}/>
          </>
        )}
      </div>

      <div className="rf-split">
        <div className="rf-card-full">
          <div className="rf-panel-head">
            <div>
              <div className="rf-panel-title">Calls vs bookings · today</div>
              <div className="rf-panel-sub">{compareOn ? `Hourly pacing · overlaid with ${cmpMode==='ly2'?'2024':'2025'}` : 'Hourly pacing'}</div>
            </div>
          </div>
          <HourChart data={data.hourly} accent={accent} compareOn={compareOn}/>
          {compareOn && <window.CMP.TrendLegend mode={cmpMode}/>}
        </div>

        <div className="rf-potential">
          <div className="rf-pot-head">
            <div className="rf-pot-label">Agent leaderboard</div>
            {compareOn && <div className="rf-pot-hint">Rate · Δ vs LY</div>}
          </div>
          {data.agents.map((a, i) => (
            <div key={a.name} className="rf-pot-row">
              <span className={`rf-rank rf-rank-${i<3?i+1:'n'} rf-rank-inline`}>#{i+1}</span>
              <span className="rf-pot-name">{a.name}</span>
              {compareOn
                ? <span className="rf-pot-num" style={{display:'inline-flex', gap:6, alignItems:'center'}}>
                    {a.rate.toFixed(0)}%
                    <window.CMP.ComparePill cur={a.rate} comp={a.lyRate} percentUnit size="sm"/>
                  </span>
                : <span className="rf-pot-num">{a.booked}/{a.calls} · {a.rate.toFixed(0)}%</span>}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function HourChart({ data, accent, compareOn }) {
  const w = 720, h = 220, pad = 28;
  const allVals = compareOn
    ? data.flatMap(d => [d.calls, d.lyCalls || 0])
    : data.map(d=>d.calls);
  const max = Math.max(...allVals);
  const bw = (w - pad*2) / data.length * 0.8;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="100%">
      {[0.25, 0.5, 0.75].map(g => (
        <line key={g} x1={pad} x2={w-pad} y1={h-pad-(h-pad*2)*g} y2={h-pad-(h-pad*2)*g} stroke="currentColor" strokeOpacity="0.08"/>
      ))}
      {data.map((d,i)=>{
        const x = pad + (i/(data.length-1)) * (w - pad*2) - bw/2;
        const hCalls = (d.calls/max) * (h-pad*2);
        const hBooked = (d.booked/max) * (h-pad*2);
        const lyH = compareOn ? ((d.lyBooked || 0)/max) * (h-pad*2) : 0;
        return (
          <g key={i}>
            <rect x={x} y={h-pad-hCalls} width={bw} height={hCalls} fill="currentColor" opacity="0.12" rx="2"/>
            <rect x={x} y={h-pad-hBooked} width={bw} height={hBooked} fill={accent} rx="2"/>
            {compareOn && (
              <rect x={x} y={h-pad-lyH} width={bw} height={2} fill="currentColor" opacity="0.55"/>
            )}
            <text x={x+bw/2} y={h-8} textAnchor="middle" fontSize="10" fill="currentColor" opacity="0.55">{d.hr}</text>
          </g>
        );
      })}
    </svg>
  );
}

function Memberships({ data, chart, accent, compareOn, cmpMode }) {
  const pct = (data.active/data.goal)*100;
  const lyData = cmpMode === 'ly2' ? data.ly2 : data.ly;
  const lyHistory = data.lyHistory || [];

  const insights = React.useMemo(() => {
    if (!compareOn) return [];
    const items = [];
    const delta = data.active - lyData.active;
    const pctD = (delta / lyData.active) * 100;
    items.push({
      tone: delta >= 0 ? 'up' : 'down',
      title: `${Math.abs(delta).toLocaleString()} more members than ${cmpMode==='ly2'?'2 years ago':'last year'}`,
      sub: `${data.active.toLocaleString()} now · ${lyData.active.toLocaleString()} then · ${pctD>=0?'+':''}${pctD.toFixed(1)}%`,
    });
    const newDelta = data.newMonth - lyData.newMonth;
    items.push({
      tone: newDelta >= 0 ? 'up' : 'down',
      title: `New signups ${newDelta>=0?'+':''}${newDelta} vs LY`,
      sub: `${data.newMonth} this month · ${lyData.newMonth} last year`,
    });
    const churnDelta = data.churnMonth - lyData.churnMonth;
    items.push({
      tone: churnDelta <= 0 ? 'up' : 'down',
      title: `Churn ${churnDelta<=0?'down':'up'} ${Math.abs(churnDelta)} vs LY`,
      sub: `${data.churnMonth} cancels · ${lyData.churnMonth} last year`,
    });
    return items.slice(0, 3);
  }, [compareOn, cmpMode, data]);

  return (
    <>
      {compareOn && <window.CMP.CompareBanner insights={insights} mode={cmpMode}/>}

      <div className="rf-hero">
        <div className="rf-hero-main">
          <div className="rf-hero-label">Active Cool Club members</div>
          <div className="rf-hero-number">{data.active.toLocaleString()}</div>
          <div className="rf-hero-meta">
            <span>{data.goal.toLocaleString()} goal</span>
            <span className="rf-dot"/>
            <span className="rf-hero-pct">{pct.toFixed(1)}% to goal</span>
            <span className="rf-dot"/>
            {compareOn
              ? <>
                  <window.CMP.ComparePill cur={data.active} comp={lyData.active}/>
                  <span className="rf-muted"> vs {cmpMode==='ly2'?'2024':'2025'}</span>
                </>
              : <span className="rf-muted">+{data.netMonth} net this month</span>}
          </div>
          <div className="rf-bar" style={{marginTop:16}}>
            <div className="rf-bar-fill" style={{width: Math.min(pct,100)+'%'}}/>
          </div>
        </div>
        <div className="rf-hero-chart">
          {compareOn
            ? <>
                <DualTrendLine cur={data.history} ly={lyHistory} accent={accent}/>
                <window.CMP.TrendLegend mode={cmpMode}/>
              </>
            : <TrendLine values={data.history} accent={accent} chart={chart}/>}
        </div>
      </div>

      <div className="rf-kpis">
        {compareOn ? (
          <>
            <window.CMP.CompareTile label="New this month" cur={data.newMonth}   compKpi={{ly: lyData.newMonth, ly2: (data.ly2||{}).newMonth}}   mode={cmpMode} fmt={v=>'+'+v}/>
            <div className="rf-kpi"><div className="rf-kpi-label">New this week</div><div className="rf-kpi-value">+{data.newWeek}</div></div>
            <window.CMP.CompareTile label="Churn MTD"      cur={data.churnMonth} compKpi={{ly: lyData.churnMonth, ly2: (data.ly2||{}).churnMonth}} mode={cmpMode} fmt={v=>'−'+v}/>
            <window.CMP.CompareTile label="Net MTD"        cur={data.netMonth}   compKpi={{ly: lyData.netMonth,   ly2: (data.ly2||{}).netMonth}}   mode={cmpMode} fmt={v=>'+'+v}/>
          </>
        ) : (
          <>
            <div className="rf-kpi"><div className="rf-kpi-label">New this month</div><div className="rf-kpi-value">+{data.newMonth}</div></div>
            <div className="rf-kpi"><div className="rf-kpi-label">New this week</div><div className="rf-kpi-value">+{data.newWeek}</div></div>
            <div className="rf-kpi"><div className="rf-kpi-label">Churn MTD</div><div className="rf-kpi-value">−{data.churnMonth}</div></div>
            <div className="rf-kpi"><div className="rf-kpi-label">Net MTD</div><div className="rf-kpi-value">+{data.netMonth}</div></div>
          </>
        )}
      </div>

      <div className="rf-card-full">
        <div className="rf-panel-head"><div><div className="rf-panel-title">Membership mix</div><div className="rf-panel-sub">{compareOn ? `By tier · counts include Δ vs ${cmpMode==='ly2'?'2024':'2025'}` : 'By tier'}</div></div></div>
        {data.breakdown.map(t => {
          const p = (t.count/data.active)*100;
          return (
            <div key={t.tier} className="rf-mem-row">
              <span className="rf-mem-sw" style={{background: t.color}}/>
              <span className="rf-mem-tier">{t.tier}</span>
              <span className="rf-mem-price rf-muted">${t.price}/mo</span>
              <div className="rf-mem-bar"><div style={{width: p+'%', background: t.color}}/></div>
              <span className="rf-mem-count rf-num rf-bold">{t.count.toLocaleString()}</span>
              {compareOn
                ? <window.CMP.ComparePill cur={t.count} comp={t.lyCount} size="sm"/>
                : <span className="rf-mem-pct rf-muted rf-num">{p.toFixed(0)}%</span>}
            </div>
          );
        })}
      </div>
    </>
  );
}

function DualTrendLine({ cur, ly, accent }) {
  const w = 520, h = 140, pad = 8;
  const all = [...cur, ...ly];
  const min = Math.min(...all), max = Math.max(...all), range = max - min || 1;
  const x = (i, arr) => pad + (i/(arr.length-1)) * (w - pad*2);
  const y = v => h - pad - ((v-min)/range) * (h - pad*2);
  const mkPath = arr => arr.map((v,i)=>(i?'L':'M')+x(i,arr).toFixed(1)+' '+y(v).toFixed(1)).join(' ');
  const curPath = mkPath(cur);
  const lyPath = mkPath(ly);
  const area = curPath + ` L${x(cur.length-1,cur).toFixed(1)} ${h-pad} L${x(0,cur).toFixed(1)} ${h-pad} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h}>
      <path d={area} fill={accent} opacity="0.10"/>
      <path d={lyPath} fill="none" stroke="currentColor" strokeOpacity="0.55" strokeWidth="1.8"/>
      <path d={curPath} fill="none" stroke={accent} strokeWidth="2.4"/>
      <circle cx={x(cur.length-1,cur)} cy={y(cur[cur.length-1])} r="4" fill={accent}/>
      <circle cx={x(ly.length-1,ly)} cy={y(ly[ly.length-1])} r="3" fill="currentColor" opacity="0.55"/>
    </svg>
  );
}

function TrendLine({ values, accent, chart }) {
  const w = 520, h = 140, pad = 8;
  const min = Math.min(...values), max = Math.max(...values), range = max - min || 1;
  const x = i => pad + (i/(values.length-1)) * (w - pad*2);
  const y = v => h - pad - ((v-min)/range) * (h - pad*2);
  const path = values.map((v,i)=>(i?'L':'M')+x(i).toFixed(1)+' '+y(v).toFixed(1)).join(' ');
  const area = path + ` L${x(values.length-1).toFixed(1)} ${h-pad} L${x(0).toFixed(1)} ${h-pad} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h}>
      {chart !== 'lines' && <path d={area} fill={accent} opacity="0.12"/>}
      <path d={path} fill="none" stroke={accent} strokeWidth="2"/>
      <circle cx={x(values.length-1)} cy={y(values[values.length-1])} r="4" fill={accent}/>
    </svg>
  );
}

window.OperationsView = OperationsView;
