'use client';

import { useMemo } from 'react';
import { linearScale, niceTicks } from '@/lib/charts/scale';
import { fmtMoney } from '@/lib/format/money';
import { fmtPercent } from '@/lib/format/percent';

export interface ComboChartPoint {
  label: string;
  bar: number;
  line: number;
}

export interface ComboChartProps {
  data: ComboChartPoint[];
  barAxis: { label: string; unit: 'bps' | 'count' };
  lineAxis: { label: string; unit: 'cents' | 'count' };
  height?: number;
  width?: number;
  accent?: string;
  className?: string;
}

const PAD = { top: 20, right: 52, bottom: 32, left: 52 };

function fmt(v: number, unit: 'bps' | 'cents' | 'count'): string {
  if (unit === 'bps') return fmtPercent(v, { decimals: 0 });
  if (unit === 'cents') return fmtMoney(v, { abbreviate: true });
  return v.toLocaleString('en-US');
}

export function ComboChart({
  data,
  barAxis,
  lineAxis,
  height = 260,
  width = 720,
  accent = 'var(--accent)',
  className,
}: ComboChartProps) {
  const { barTicks, lineTicks, bars, linePath, linePoints } = useMemo(() => {
    const barMax = Math.max(...data.map((d) => d.bar), 1);
    const lineMin = Math.min(...data.map((d) => d.line));
    const lineMax = Math.max(...data.map((d) => d.line));

    const barTicks = niceTicks(barMax, 4);
    const barDomainMax = barTicks[barTicks.length - 1] ?? barMax;

    // Tight-ish line axis — leave 10% padding on either side
    const lineRange = lineMax - lineMin || 1;
    const lineFloor = Math.max(0, lineMin - lineRange * 0.1);
    const lineCeil = lineMax + lineRange * 0.1;
    const lineTicks = niceTicks(lineCeil, 4).filter((t) => t >= lineFloor);

    const barAreaW = width - PAD.left - PAD.right;
    const slot = barAreaW / data.length;
    const barW = Math.max(8, slot * 0.55);

    const x = linearScale([0, Math.max(data.length - 1, 1)], [PAD.left + slot / 2, width - PAD.right - slot / 2]);
    const yBar = linearScale([0, barDomainMax], [height - PAD.bottom, PAD.top]);
    const yLine = linearScale([lineFloor, lineTicks[lineTicks.length - 1] ?? lineCeil], [height - PAD.bottom, PAD.top]);

    const bars = data.map((d, i) => {
      const cx = x(i);
      const top = yBar(d.bar);
      return {
        i,
        label: d.label,
        xLeft: cx - barW / 2,
        xCenter: cx,
        top,
        barW,
        h: Math.max(0, height - PAD.bottom - top),
      };
    });

    const linePath = data
      .map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)},${yLine(d.line).toFixed(2)}`)
      .join(' ');

    const linePoints = data.map((d, i) => ({ cx: x(i), cy: yLine(d.line) }));

    return { barTicks, lineTicks, bars, linePath, linePoints, yLine };
  }, [data, height, width]);

  const yForBar = (v: number) => {
    const max = barTicks[barTicks.length - 1] ?? 1;
    return linearScale([0, max], [height - PAD.bottom, PAD.top])(v);
  };
  const yForLine = (v: number) => {
    const max = lineTicks[lineTicks.length - 1] ?? 1;
    const min = lineTicks[0] ?? 0;
    return linearScale([min, max], [height - PAD.bottom, PAD.top])(v);
  };

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      className={className ?? 'w-full h-full'}
      role="img"
    >
      {/* Gridlines based on bar ticks */}
      <g className="chart-grid">
        {barTicks.map((t) => (
          <line key={t} x1={PAD.left} x2={width - PAD.right} y1={yForBar(t)} y2={yForBar(t)} />
        ))}
      </g>

      {/* Left axis (bars) */}
      <g>
        {barTicks.map((t) => (
          <text
            key={t}
            x={PAD.left - 8}
            y={yForBar(t)}
            textAnchor="end"
            dominantBaseline="central"
            fontSize={11}
            fontFamily="var(--font-mono)"
            style={{ letterSpacing: '0.08em' }}
            fill="var(--muted)"
          >
            {fmt(t, barAxis.unit)}
          </text>
        ))}
      </g>

      {/* Right axis (line) */}
      <g>
        {lineTicks.map((t) => (
          <text
            key={t}
            x={width - PAD.right + 8}
            y={yForLine(t)}
            textAnchor="start"
            dominantBaseline="central"
            fontSize={11}
            fontFamily="var(--font-mono)"
            style={{ letterSpacing: '0.08em' }}
            fill="var(--muted)"
          >
            {fmt(t, lineAxis.unit)}
          </text>
        ))}
      </g>

      {/* Bars */}
      {bars.map((b) => (
        <g key={b.i}>
          <rect
            x={b.xLeft}
            y={b.top}
            width={b.barW}
            height={b.h}
            rx={3}
            fill={accent}
            fillOpacity={0.35}
          />
          <text
            x={b.xCenter}
            y={height - 10}
            textAnchor="middle"
            fontSize={11}
            fontFamily="var(--font-mono)"
            style={{ letterSpacing: '0.08em' }}
            fill="var(--muted)"
          >
            {b.label}
          </text>
        </g>
      ))}

      {/* Line */}
      <path d={linePath} fill="none" stroke={accent} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {linePoints.map((p, i) => (
        <circle key={i} cx={p.cx} cy={p.cy} r={3} fill={accent} />
      ))}

      {/* Axis labels (eyebrows) */}
      <text
        x={PAD.left}
        y={12}
        fontSize={10}
        fontFamily="var(--font-mono)"
        style={{ letterSpacing: '0.08em' }}
        fill="var(--muted)"
      >
        {barAxis.label.toUpperCase()}
      </text>
      <text
        x={width - PAD.right}
        y={12}
        textAnchor="end"
        fontSize={10}
        fontFamily="var(--font-mono)"
        style={{ letterSpacing: '0.08em' }}
        fill="var(--muted)"
      >
        {lineAxis.label.toUpperCase()}
      </text>
    </svg>
  );
}
