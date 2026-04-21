export function linearScale(domain: [number, number], range: [number, number]) {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0 || 1;
  return (v: number) => r0 + ((v - d0) / span) * (r1 - r0);
}

/** Round max up to a nice number; return `count+1` evenly spaced ticks from 0. */
export function niceTicks(max: number, count = 5): number[] {
  if (max <= 0) return [0];
  const raw = max / count;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const frac = raw / pow;
  const niceFrac = frac < 1.5 ? 1 : frac < 3 ? 2 : frac < 7 ? 5 : 10;
  const step = niceFrac * pow;
  const steps = Math.ceil(max / step);
  return Array.from({ length: steps + 1 }, (_, i) => i * step);
}

/** Build an SVG path `d` attribute for a line connecting `values` to the given box. */
export function sparkPath(values: number[], width: number, height: number): string {
  if (!values.length) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const stepX = width / Math.max(values.length - 1, 1);
  return values
    .map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / span) * height;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}

/** Closed area variant (for filled sparkline). */
export function sparkArea(values: number[], width: number, height: number): string {
  const line = sparkPath(values, width, height);
  if (!line) return '';
  const stepX = width / Math.max(values.length - 1, 1);
  const lastX = (values.length - 1) * stepX;
  return `${line} L${lastX.toFixed(2)},${height} L0,${height} Z`;
}
