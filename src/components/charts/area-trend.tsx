'use client';

import { useId, useMemo } from 'react';
import { linearScale, niceTicks } from '@/lib/charts/scale';
import { fmtMoney } from '@/lib/format/money';

export interface AreaTrendPoint {
  label: string;
  value: number;
  target?: number;
}

export interface AreaTrendProps {
  data: AreaTrendPoint[];
  height?: number;
  showTarget?: boolean;
  accent?: string;
  /** 'cents' triggers money formatting on the y-axis. Default: 'count'. */
  unit?: 'cents' | 'count';
  /** Fixed viewBox width; chart scales via CSS to its container. */
  width?: number;
  className?: string;
}

const PAD = { top: 16, right: 16, bottom: 28, left: 52 };

export function AreaTrend({
  data,
  height = 220,
  showTarget = true,
  accent = 'var(--accent)',
  unit = 'cents',
  width = 800,
  className,
}: AreaTrendProps) {
  const gradId = useId();

  const { pathD, areaD, targetD, ticks, xPos, yFor } = useMemo(() => {
    const values = data.map((d) => d.value);
    const targets = data.map((d) => d.target ?? 0);
    const yMax = Math.max(...values, ...targets) * 1.05;
    const ticks = niceTicks(yMax, 4);
    const yDomainMax = ticks[ticks.length - 1] ?? yMax;

    const x = linearScale([0, Math.max(data.length - 1, 1)], [PAD.left, width - PAD.right]);
    const y = linearScale([0, yDomainMax], [height - PAD.bottom, PAD.top]);

    const line = data
      .map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)},${y(d.value).toFixed(2)}`)
      .join(' ');

    const area = data.length
      ? `${line} L${x(data.length - 1).toFixed(2)},${height - PAD.bottom} L${x(0).toFixed(2)},${height - PAD.bottom} Z`
      : '';

    const target =
      showTarget && data.some((d) => d.target !== undefined)
        ? data
            .map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)},${y(d.target ?? 0).toFixed(2)}`)
            .join(' ')
        : null;

    return { pathD: line, areaD: area, targetD: target, ticks, xPos: x, yFor: y };
  }, [data, height, width, showTarget]);

  const fmtY = (v: number) => (unit === 'cents' ? fmtMoney(v, { abbreviate: true }) : v.toLocaleString('en-US'));

  const labelStride = Math.max(1, Math.ceil(data.length / 8));

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      className={className ?? 'w-full h-full'}
      role="img"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity={0.35} />
          <stop offset="100%" stopColor={accent} stopOpacity={0} />
        </linearGradient>
      </defs>

      {/* Horizontal gridlines + y-axis labels */}
      <g className="chart-grid">
        {ticks.map((t) => (
          <line key={t} x1={PAD.left} x2={width - PAD.right} y1={yFor(t)} y2={yFor(t)} />
        ))}
      </g>
      <g>
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
            {fmtY(t)}
          </text>
        ))}
      </g>

      {/* Target line (dashed) */}
      {targetD && (
        <path
          d={targetD}
          fill="none"
          stroke="var(--muted)"
          strokeOpacity={0.5}
          strokeDasharray="4 4"
          strokeWidth={1}
        />
      )}

      {/* Area + line */}
      {areaD && <path d={areaD} fill={`url(#${gradId})`} />}
      <path d={pathD} fill="none" stroke={accent} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

      {/* X labels */}
      <g>
        {data.map((d, i) =>
          i % labelStride === 0 || i === data.length - 1 ? (
            <text
              key={i}
              x={xPos(i)}
              y={height - 8}
              textAnchor="middle"
              fontSize={11}
              fontFamily="var(--font-mono)"
              style={{ letterSpacing: '0.08em' }}
              fill="var(--muted)"
            >
              {d.label}
            </text>
          ) : null,
        )}
      </g>
    </svg>
  );
}
