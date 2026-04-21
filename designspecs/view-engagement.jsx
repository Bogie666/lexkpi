/* global React */
const EU = window.RF.U;
const { DeltaPill: EDelta, Sparkline: ESpark, KpiCard: EKpi, SectionHead: EHead, PeriodTabs: EPeriod } = window.RF;

function EngagementView({ data, density, layout, chart, accent, theme }) {
  const { useState } = React;
  const [sub, setSub] = useState('reviews');
  const r = data.reviews;

  return (
    <>
      <EHead eyebrow="Engagement" title={sub==='reviews'?'Reviews':'Top Performers'} right={
        <EPeriod active="MTD" options={['MTD','QTD','YTD']}/>
      }/>

      <div className="rf-subtabs">
        <button className={sub==='reviews'?'on':''} onClick={()=>setSub('reviews')}>Reviews</button>
        <button className={sub==='top'?'on':''} onClick={()=>setSub('top')}>Top Performers</button>
      </div>

      {sub === 'reviews' && (
        <>
          <div className="rf-hero">
            <div className="rf-hero-main">
              <div className="rf-hero-label">Average rating</div>
              <div className="rf-hero-number">{r.avgRating.toFixed(2)}<span className="rf-hero-unit"> ★</span></div>
              <div className="rf-hero-meta">
                <span>{r.total.toLocaleString()} total reviews</span>
                <span className="rf-dot"/>
                <span className="rf-hero-pct">{r.thisMonth} new this month</span>
              </div>
              <div className="rf-stars">
                {[5,4,3,2,1].map(s => {
                  const pct = (r.byStar[s]/r.total)*100;
                  return (
                    <div key={s} className="rf-star-row">
                      <span className="rf-star-n">{s}★</span>
                      <div className="rf-bar"><div className="rf-bar-fill" style={{width: pct+'%'}}/></div>
                      <span className="rf-star-c rf-muted rf-num">{r.byStar[s].toLocaleString()}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="rf-hero-chart">
              <RatingTrend values={r.trend} accent={accent} chart={chart}/>
              <div className="rf-muted rf-xs" style={{marginTop:8}}>12-month rating trend</div>
            </div>
          </div>

          <div className="rf-card-full">
            <div className="rf-panel-head"><div><div className="rf-panel-title">Recent reviews</div><div className="rf-panel-sub">Latest 5 · auto-synced from Google</div></div></div>
            <div className="rf-review-list">
              {r.recent.map((rev, i) => (
                <div key={i} className="rf-review">
                  <div className="rf-review-head">
                    <span className="rf-avatar-sm" data-initial={rev.name.split(' ').map(s=>s[0]).join('')}/>
                    <span className="rf-review-name">{rev.name}</span>
                    <span className="rf-review-stars">
                      {Array.from({length:5}, (_,k)=>(
                        <span key={k} className={k<rev.rating?'on':''}>★</span>
                      ))}
                    </span>
                    <span className="rf-review-date rf-muted">{rev.date}</span>
                  </div>
                  <div className="rf-review-text">{rev.text}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {sub === 'top' && (
        <div className="rf-podium">
          {[data.topPerformers[1], data.topPerformers[0], data.topPerformers[2]].map((p, i) => {
            if (!p) return <div key={i}/>;
            const place = [2, 1, 3][i];
            return (
              <div key={p.name} className={`rf-pod rf-pod-${place}`}>
                <div className="rf-pod-rank">{['1st','2nd','3rd'][place-1]}</div>
                <div className="rf-pod-avatar" data-initial={p.name.split(' ').map(s=>s[0]).join('')}/>
                <div className="rf-pod-name">{p.name}</div>
                <div className="rf-muted rf-xs">{p.role}</div>
                <div className="rf-pod-metric">{EU.fmtMoney(p.revenue, false)}</div>
                <div className="rf-pod-sub">
                  <span>{p.rating.toFixed(2)}★</span>
                  <span className="rf-dot"/>
                  <span>{p.reviews} reviews</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function RatingTrend({ values, accent, chart }) {
  const w = 520, h = 140, pad = 8;
  const min = 4.7, max = 5.0;
  const x = i => pad + (i/(values.length-1)) * (w - pad*2);
  const y = v => h - pad - ((v-min)/(max-min)) * (h - pad*2);
  const path = values.map((v,i)=>(i?'L':'M')+x(i).toFixed(1)+' '+y(v).toFixed(1)).join(' ');
  const area = path + ` L${x(values.length-1).toFixed(1)} ${h-pad} L${x(0).toFixed(1)} ${h-pad} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h}>
      {chart !== 'lines' && <path d={area} fill={accent} opacity="0.12"/>}
      <line x1={pad} x2={w-pad} y1={y(4.9)} y2={y(4.9)} stroke="currentColor" strokeOpacity="0.2" strokeDasharray="3 3"/>
      <path d={path} fill="none" stroke={accent} strokeWidth="2"/>
      <circle cx={x(values.length-1)} cy={y(values[values.length-1])} r="4" fill={accent}/>
    </svg>
  );
}

window.EngagementView = EngagementView;
