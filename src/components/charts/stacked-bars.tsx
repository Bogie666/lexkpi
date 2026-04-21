'use client';

import { useMemo } from 'react';
import type { CompareMode } from '@/lib/state/url-params';

export interface StackedBarsPoint {
  label: string;
  total: number;
  highlighted: number;
  lyTotal?: number;
  lyHighlighted?: number;
}

export interface StackedBarsProps {
  data: StackedBarsPoint[];
  compareMode?: CompareMode;
  /** CSS color for the solid "highlighted" (booked) series. */
  accentHighlight?: string;
  height?: number;
  width?: number;
  className?: string;
}

const PAD = { top: 16, right: 16, bottom: 32, left: 40 };

export function StackedBars({
  data,
  compareMode = 'none',
  accentHighlight = 'var(--accent)',
  height = 260,
  width = 720,
  className,
}: StackedBarsProps) {
  const compareOn = compareMode === 'ly' || compareMode === 'ly2';

  const { bars, ticks, barW, lyMark } = useMemo(() => {
    const maxPool = compareOn
      ? data.flatMap((d) => [d.total, d.lyTotal ?? 0])
      : data.map((d) => d.total);
    const max = Math.max(...maxPool, 1) * 1.1;
    const tickStep = max <= 20 ? 5 : max <= 50 ? 10 : max <= 100 ? 20 : Math.pow(10, Math.floor(Math.log10(max / 5)));
    const ticks: number[] = [];
    for (let v = 0; v <= max; v += tickStep) ticks.push(v);

    const barAreaW = width - PAD.left - PAD.right;
    const slot = barAreaW / data.length;
    const barW = Math.max(8, slot * 0.7);
    const y = (v: number) => height - PAD.bottom - (v / max) * (height - PAD.top - PAD.bottom);
    const xCenter = (i: number) => PAD.left + slot * (i + 0.5);

    const bars = data.map((d, i) => ({
      i,
      label: d.label,
      xLeft: xCenter(i) - barW / 2,
      totalTop: y(d.total),
      bookedTop: y(d.highlighted),
      totalHeight: height - PAD.bottom - y(d.total),
      bookedHeight: height - PAD.bottom - y(d.highlighted),
    }));

    const lyMark = compareOn
      ? data.map((d, i) => ({
          i,
          xLeft: xCenter(i) - barW / 2,
          y: y(d.lyHighlighted ?? 0),
        }))
      : null;

    return { bars, ticks, barW, lyMark };
  }, [data, compareOn, height, width]);

  const yFor = (v: number) => {
    const max = ticks[ticks.length - 1] || 1;
    return height - PAD.bottom - (v / max) * (height - PAD.top - PAD.bottom);
  };

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      className={className ?? 'w-full h-full'}
      role="img"
    >
      {/* Horizontal gridlines */}
      <g className="chart-grid">
        {ticks.map((t) => (
          <line key={t} x1={PAD.left} x2={width - PAD.right} y1={yFor(t)} y2={yFor(t)} />
        ))}
      </g>
      {/* Y-axis labels */}
      {ticks.map((t) => (
        <text
          key={t}
          x={PAD.left - 8}
          y={yFor(t)}
          textAnchor="end"
          dominantBaseline="central"
          fontSize={11}
          fontFamily="var(--font-mono)"
          style={{ letterSpacing: '0.08em' }}
          fill="var(--muted)"
        >
          {t}
        </text>
      ))}

      {/* Bars — total (translucent) + booked (accent) on top */}
      {bars.map((b) => (
        <g key={b.i}>
          <rect
            x={b.xLeft}
            y={b.totalTop}
            width={barW}
            height={Math.max(b.totalHeight, 0)}
            rx={3}
            fill="var(--muted)"
            fillOpacity={0.18}
          />
          <rect
            x={b.xLeft}
            y={b.bookedTop}
            width={barW}
            height={Math.max(b.bookedHeight, 0)}
            rx={3}
            fill={accentHighlight}
          />
          <text
            x={b.xLeft + barW / 2}
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

      {/* LY booked marker line behind each bar */}
      {lyMark &&
        lyMark.map((m) => (
          <rect
            key={`ly-${m.i}`}
            x={m.xLeft}
            y={m.y - 1}
            width={barW}
            height={2}
            fill="var(--muted)"
            fillOpacity={0.75}
          />
        ))}
    </svg>
  );
}
