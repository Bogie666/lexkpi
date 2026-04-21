/* global React */
const { SectionHead: ToolsHead } = window.RF;

function ToolsView({ data, density, layout, chart, accent, theme }) {
  return (
    <>
      <ToolsHead eyebrow="Tools" title="Utilities & admin" right={null}/>
      <div className="rf-tools-grid">
        {data.map(t => (
          <div key={t.id} className="rf-tool">
            <div className="rf-tool-head">
              <span className="rf-tool-name">{t.title}</span>
              <span className={`rf-tool-badge rf-tool-${t.status.toLowerCase()}`}>{t.status}</span>
            </div>
            <p className="rf-tool-sub">{t.sub}</p>
            <button className="rf-tool-cta">Open →</button>
          </div>
        ))}
      </div>
    </>
  );
}

window.ToolsView = ToolsView;
