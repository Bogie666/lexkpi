/* global React */
// Direction A — shell. Renders top-level tab bar + compare-mode toggle, dispatches to views.

const ShU = window.RF.U;

const TABS = [
  { id: 'financial',    label: 'Financial',    short: 'FIN' },
  { id: 'technicians',  label: 'Technicians',  short: 'TECH' },
  { id: 'operations',   label: 'Operations',   short: 'OPS' },
  { id: 'engagement',   label: 'Engagement',   short: 'ENG' },
  { id: 'analyze',      label: 'Analyze',      short: 'ANL' },
  { id: 'tools',        label: 'Tools',        short: 'TOOLS' },
];

// Tabs that support compare mode
const COMPARE_TABS = new Set(['financial', 'technicians', 'operations']);

function DirectionA({ data, density, layout, chart, accent, theme, tab, onTabChange,
                     compareMode, compareYear, onCompareToggle, onCompareYearChange }) {
  const pad = density === 'compact' ? 'rf-pd-c' : density === 'spacious' ? 'rf-pd-s' : 'rf-pd-m';
  const active = tab || 'financial';
  const supportsCompare = COMPARE_TABS.has(active);
  const compareOn = compareMode && supportsCompare;

  const ViewForTab = {
    financial:   window.FinancialView,
    technicians: window.TechniciansView,
    operations:  window.OperationsView,
    engagement:  window.EngagementView,
    analyze:     window.AnalyzeView,
    tools:       window.ToolsView,
  }[active];

  const viewData = {
    financial:   data.financial,
    technicians: data.technicians,
    operations:  data.operations,
    engagement:  data.engagement,
    analyze:     data.analyze,
    tools:       data.tools,
  }[active];

  return (
    <div className={`refined theme-${theme} ${pad}`} style={{ ['--accent']: accent }}>
      <nav className="rf-nav">
        <div className="rf-nav-brand">
          <span className="rf-nav-logo"/>
          <div className="rf-nav-brand-text">
            <div className="rf-nav-brand-title">Lex KPI</div>
            <div className="rf-nav-brand-sub">Service Star · Lexington</div>
          </div>
        </div>
        <div className="rf-nav-tabs">
          {TABS.map(t => (
            <button
              key={t.id}
              className={`rf-nav-tab ${t.id === active ? 'on' : ''}`}
              onClick={() => onTabChange && onTabChange(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="rf-nav-right">
          {supportsCompare && (
            <>
              {compareOn && (
                <div className="rf-compare-yr">
                  <button className={compareYear==='ly'?'on':''} onClick={()=>onCompareYearChange('ly')}>2025</button>
                  <button className={compareYear==='ly2'?'on':''} onClick={()=>onCompareYearChange('ly2')}>2024</button>
                </div>
              )}
              <button
                className={`rf-compare-toggle ${compareOn ? 'on' : ''}`}
                onClick={() => onCompareToggle && onCompareToggle(!compareMode)}
                title="Toggle year-over-year comparison"
              >
                <span className="rf-compare-dot"/>
                Compare
              </button>
            </>
          )}
          <button className="rf-nav-icon" title="Refresh">↻</button>
          <span className="rf-nav-live"><span className="rf-live-dot"/>LIVE</span>
        </div>
      </nav>

      <div className="rf-view">
        {ViewForTab
          ? <ViewForTab data={viewData} density={density} layout={layout} chart={chart} accent={accent} theme={theme}
                        compareOn={compareOn} compareMode={compareYear}/>
          : <div className="rf-empty">Tab not found</div>}
      </div>
    </div>
  );
}

window.DirectionA = DirectionA;
window.DIRECTION_A_TABS = TABS;
