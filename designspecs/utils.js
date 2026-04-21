// Utility formatters used by all directions
window.KPI_UTILS = (() => {
  const fmtMoney = (n, short = true) => {
    if (short) {
      if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
      if (Math.abs(n) >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
      return '$' + Math.round(n);
    }
    return '$' + n.toLocaleString('en-US');
  };
  const fmtPct = (n, digits = 0) => (n >= 0 ? '+' : '') + n.toFixed(digits) + '%';
  const pctChange = (cur, prev) => prev > 0 ? ((cur - prev) / prev) * 100 : 0;
  const pctOf = (cur, target) => target > 0 ? (cur / target) * 100 : 0;

  // Build an SVG sparkline path
  const sparkPath = (values, w, h, pad = 2) => {
    if (!values || !values.length) return '';
    const min = Math.min(...values), max = Math.max(...values);
    const range = max - min || 1;
    const step = (w - pad * 2) / (values.length - 1);
    return values.map((v, i) => {
      const x = pad + i * step;
      const y = h - pad - ((v - min) / range) * (h - pad * 2);
      return (i === 0 ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1);
    }).join(' ');
  };

  const sparkArea = (values, w, h, pad = 2) => {
    if (!values || !values.length) return '';
    const min = Math.min(...values), max = Math.max(...values);
    const range = max - min || 1;
    const step = (w - pad * 2) / (values.length - 1);
    const pts = values.map((v, i) => {
      const x = pad + i * step;
      const y = h - pad - ((v - min) / range) * (h - pad * 2);
      return [x, y];
    });
    let d = 'M' + pts[0][0].toFixed(1) + ' ' + pts[0][1].toFixed(1);
    for (let i = 1; i < pts.length; i++) d += ' L' + pts[i][0].toFixed(1) + ' ' + pts[i][1].toFixed(1);
    d += ' L' + pts[pts.length - 1][0].toFixed(1) + ' ' + (h - pad).toFixed(1);
    d += ' L' + pts[0][0].toFixed(1) + ' ' + (h - pad).toFixed(1) + ' Z';
    return d;
  };

  return { fmtMoney, fmtPct, pctChange, pctOf, sparkPath, sparkArea };
})();
