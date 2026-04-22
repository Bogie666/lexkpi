'use client';

import { useId, useMemo } from 'react';
import { linearScale, niceTicks } from '@/lib/charts/scale';
import { fmtMoney } from '@/lib/format/money';

export interface DualTrendPoint {
  label: string;
  actual: number;
  ly?: number;
  ly2?: number;
  target?: number;
}

export interface DualTrendProps {
  data: DualTrendPoint[];
  /** Which comparison baseline to emphasize. When 'ly2', both LY and LY2 are drawn. */
  mode: 'ly' | 'ly2';
  height?: number;
  width?: number;
  accent?: string;
  showTarget?: boolean;
  unit?: 'cents' | 'count';
  className?: string;
}

// See AreaTrend for the padding rationale — the same story applies here.
const PAD = { top: 16, right: 40, bottom: 28, left: 56 };

export function DualTrend({
  data,
  mode,
  height = 260,
  width = 800,
  accent = 'var(--accent)',
  showTarget = true,
  unit = 'cents',
  className,
}: DualTrendProps) {
  const gradId = useId();

  const { actualD, areaD, lyD, ly2D, targetD, ticks, xPos, yFor, lastX, lastYActual, lastYLy } =
    useMemo(() => {
      const vals: number[] = [];
      for (const d of data) {
        vals.push(d.actual);
        if (d.ly !== undefined) vals.push(d.ly);
        if (mode === 'ly2' && d.ly2 !== undefined) vals.push(d.ly2);
        if (d.target !== undefined) vals.push(d.target);
      }
      const yMax = (vals.length ? Math.max(...vals) : 0) * 1.05;
      const ticks = niceTicks(yMax, 4);
      const yDomainMax = ticks[ticks.length - 1] ?? yMax;

      const x = linearScale([0, Math.max(data.length - 1, 1)], [PAD.left, width - PAD.right]);
      const y = linearScale([0, yDomainMax], [height - PAD.bottom, PAD.top]);

      const path = (key: keyof DualTrendPoint) =>
        data
          .map((d, i) => {
            const v = (d[key] as number | undefined) ?? 0;
            return `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)},${y(v).toFixed(2)}`;
          })
          .join(' ');

      const actual = path('actual');
      const area = data.length
        ? `${actual} L${x(data.length - 1).toFixed(2)},${height - PAD.bottom} L${x(0).toFixed(2)},${height - PAD.bottom} Z`
        : '';

      const ly = data.some((d) => d.ly !== undefined) ? path('ly') : null;
      const ly2 = mode === 'ly2' && data.some((d) => d.ly2 !== undefined) ? path('ly2') : null;
      const target =
        showTarget && data.some((d) => d.target !== undefined) ? path('target') : null;

      const lastI = data.length - 1;
      const lastX = data.length ? x(lastI) : 0;
      const lastActual = data.length ? y(data[lastI].actual) : 0;
      const lastLy = data.length && data[lastI].ly !== undefined ? y(data[lastI].ly!) : null;

      return {
        actualD: actual,
        areaD: area,
        lyD: ly,
        ly2D: ly2,
        targetD: target,
        ticks,
        xPos: x,
        yFor: y,
        lastX,
        lastYActual: lastActual,
        lastYLy: lastLy,
      };
    }, [data, mode, height, width, showTarget]);

  const fmtY = (v: number) =>
    unit === 'cents' ? fmtMoney(v, { abbreviate: true }) : v.toLocaleString('en-US');

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
          <stop offset="0%" stopColor={accent} stopOpacity={0.25} />
          <stop offset="100%" stopColor={accent} stopOpacity={0} />
        </linearGradient>
      </defs>

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

      {ly2D && (
        <path
          d={ly2D}
          fill="none"
          stroke="var(--muted)"
          strokeOpacity={0.45}
          strokeDasharray="2 5"
          strokeWidth={1.5}
        />
      )}

      {lyD && (
        <path
          d={lyD}
          fill="none"
          stroke="var(--muted)"
          strokeOpacity={0.65}
          strokeWidth={1.8}
          strokeDasharray="4 3"
        />
      )}

      {areaD && <path d={areaD} fill={`url(#${gradId})`} />}
      <path d={actualD} fill="none" stroke={accent} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />

      {/* End-of-line markers so YoY gap is instantly readable */}
      {lastYLy !== null && (
        <circle cx={lastX} cy={lastYLy} r={3} fill="var(--muted)" opacity={0.7} />
      )}
      <circle cx={lastX} cy={lastYActual} r={4} fill={accent} />

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
