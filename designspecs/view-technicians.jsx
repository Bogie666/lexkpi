/* global React */
const TU = window.RF.U;
const { DeltaPill: TDelta, Sparkline: TSpark, SectionHead: THead, PeriodTabs: TPeriod } = window.RF;

function TechniciansView({ data, density, layout, chart, accent, theme, compareOn, compareMode }) {
  const { useState } = React;
  const [activeRole, setActiveRole] = useState(data.roles[0].id);
  const role = data.roles.find(r => r.id === activeRole) || data.roles[0];
  const techs = data.technicians;
  const top = techs[0], second = techs[1], third = techs[2];
  const cmpMode = compareMode || 'ly';

  // Team-wide insights for the compare banner
  const teamInsights = React.useMemo(() => {
    if (!compareOn) return [];
    const t = data.team;
    const ly = (k) => cmpMode === 'ly2' ? k.ly2 : k.ly;
    const items = [];
    const revPct = ((t.revenue.value - ly(t.revenue)) / ly(t.revenue)) * 100;
    items.push({
      tone: revPct >= 0 ? 'up' : 'down',
      title: `Team revenue ${revPct>=0?'up':'down'} ${Math.abs(revPct).toFixed(1)}% vs ${cmpMode==='ly2'?'2 yrs ago':'last year'}`,
      sub: `${TU.fmtMoney(t.revenue.value, false)} now · ${TU.fmtMoney(ly(t.revenue), false)} then`,
    });
    const crDelta = t.closeRate.value - ly(t.closeRate);
    items.push({
      tone: crDelta >= 0 ? 'up' : 'down',
      title: `Close rate ${crDelta>=0?'+':''}${crDelta.toFixed(1)}pt`,
      sub: `${t.closeRate.value.toFixed(1)}% team avg · ${ly(t.closeRate).toFixed(1)}% then`,
    });
    // Biggest individual gainer
    const deltas = techs.map(x => ({ x, pct: ((x.revenue - x.ly) / x.ly) * 100 }));
    const best = [...deltas].sort((a,b) => b.pct - a.pct)[0];
    if (best && best.pct >= 5) {
      items.push({
        tone: 'up',
        title: `${best.x.name} up ${best.pct.toFixed(1)}% vs last year`,
        sub: `${TU.fmtMoney(best.x.revenue, false)} this period · was ${TU.fmtMoney(best.x.ly, false)}`,
      });
    }
    return items.slice(0, 3);
  }, [compareOn, cmpMode, data]);

  return (
    <>
      <THead eyebrow="Technicians" title={role.label} right={
        <div className="rf-head-meta">
          <TPeriod active="MTD" options={['MTD','YTD','Last Month']}/>
          <div className="rf-asof">{data.period}</div>
        </div>
      }/>

      {compareOn && (
        <window.CMP.CompareBanner insights={teamInsights} mode={cmpMode}/>
      )}

      {compareOn && (
        <div className="rf-kpis">
          <window.CMP.CompareTile label="Team revenue"   cur={data.team.revenue.value}     compKpi={data.team.revenue}     mode={cmpMode} fmt={v=>TU.fmtMoney(v,false)}/>
          <window.CMP.CompareTile label="Close rate"     cur={data.team.closeRate.value}   compKpi={data.team.closeRate}   mode={cmpMode} fmt={v=>v.toFixed(1)+'%'}/>
          <window.CMP.CompareTile label="Avg ticket"     cur={data.team.avgTicket.value}   compKpi={data.team.avgTicket}   mode={cmpMode} fmt={v=>'$'+v.toLocaleString()}/>
          <window.CMP.CompareTile label="Jobs completed" cur={data.team.jobsDone.value}    compKpi={data.team.jobsDone}    mode={cmpMode} fmt={v=>v.toLocaleString()}/>
        </div>
      )}

      {/* Role sub-tabs */}
      <div className="rf-subtabs">
        {data.roles.map(r => (
          <button key={r.id} className={r.id===activeRole?'on':''} onClick={()=>setActiveRole(r.id)}>
            {r.label}
          </button>
        ))}
      </div>

      {/* Podium */}
      <div className="rf-podium">
        {[second, top, third].map((t, i) => {
          if (!t) return <div key={i}/>;
          const place = t.rank;
          return (
            <div key={t.name} className={`rf-pod rf-pod-${place}`}>
              <div className="rf-pod-rank">{place === 1 ? '1st' : place === 2 ? '2nd' : '3rd'}</div>
              <div className="rf-pod-avatar" data-initial={t.name.split(' ').map(s=>s[0]).join('')}/>
              <div className="rf-pod-name">{t.name}</div>
              <div className="rf-pod-metric">{TU.fmtMoney(t.revenue, false)}</div>
              <div className="rf-pod-sub">
                <span>{t.closeRate.toFixed(1)}% close</span>
                <span className="rf-dot"/>
                <span>{t.jobs} jobs</span>
              </div>
              <div className="rf-pod-spark">
                <TSpark values={t.spark} w={160} h={28} chart={chart} up={t.trend!=='down'}/>
              </div>
            </div>
          );
        })}
      </div>

      {/* Leaderboard */}
      <div className="rf-table-wrap">
        <div className={`rf-table-head ${compareOn?'rf-lb-grid-cmp':'rf-lb-grid'}`}>
          <div>Rank</div><div>Technician</div>
          <div className="rf-num">Revenue</div>
          {compareOn && <div className="rf-num">Δ Revenue</div>}
          <div className="rf-num">Close rate</div>
          {compareOn && <div className="rf-num">Δ Close</div>}
          <div className="rf-num">Avg ticket</div>
          {compareOn && <div className="rf-num">Δ Ticket</div>}
          {!compareOn && <div className="rf-num">Jobs</div>}
          {!compareOn && <div className="rf-num">Memberships</div>}
          <div>Trend</div>
        </div>
        {techs.map(t => (
          <div key={t.name} className={`rf-row ${compareOn?'rf-lb-grid-cmp':'rf-lb-grid'}`}>
            <div className={`rf-rank rf-rank-${t.rank<=3?t.rank:'n'}`}>#{t.rank}</div>
            <div className="rf-dept-name">
              <span className="rf-avatar-sm" data-initial={t.name.split(' ').map(s=>s[0]).join('')}/>
              {t.name}
              <span className={`rf-swatch d-${t.dept} rf-swatch-sm`}/>
            </div>
            <div className="rf-num rf-bold">{TU.fmtMoney(t.revenue, false)}</div>
            {compareOn && <div className="rf-num"><window.CMP.ComparePill cur={t.revenue} comp={t.ly} money size="sm"/></div>}
            <div className="rf-num">{t.closeRate.toFixed(1)}%</div>
            {compareOn && <div className="rf-num"><window.CMP.ComparePill cur={t.closeRate} comp={t.lyCloseRate} percentUnit size="sm"/></div>}
            <div className="rf-num rf-muted">${t.avgTicket.toLocaleString()}</div>
            {compareOn && <div className="rf-num"><window.CMP.ComparePill cur={t.avgTicket} comp={t.lyAvgTicket} money size="sm"/></div>}
            {!compareOn && <div className="rf-num rf-muted">{t.jobs}</div>}
            {!compareOn && <div className="rf-num rf-muted">{t.memberships}</div>}
            <div>
              {compareOn
                ? <svg viewBox="0 0 100 24" width="100" height="24">
                    {(() => {
                      const all = [...t.spark, ...t.lySpark];
                      const max = Math.max(...all), min = Math.min(...all), r = max-min||1;
                      const px = (i,arr) => 2 + (i/(arr.length-1))*96;
                      const py = v => 22 - ((v-min)/r)*20;
                      const mk = arr => arr.map((v,i)=>(i?'L':'M')+px(i,arr).toFixed(1)+' '+py(v).toFixed(1)).join(' ');
                      return <>
                        <path d={mk(t.lySpark)} fill="none" stroke="currentColor" strokeOpacity="0.45" strokeWidth="1.5"/>
                        <path d={mk(t.spark)}   fill="none" stroke={accent} strokeWidth="1.8"/>
                      </>;
                    })()}
                  </svg>
                : <TSpark values={t.spark} w={100} h={24} chart={chart} up={t.trend!=='down'}/>}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

window.TechniciansView = TechniciansView;
