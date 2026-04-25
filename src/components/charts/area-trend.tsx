'use client';

import { useId, useMemo, useState } from 'react';
import { linearScale, niceTicks } from '@/lib/charts/scale';
import { fmtMoney } from '@/lib/format/money';

export interface AreaTrendPoint {
  label: string;
  value: number;
  target?: number;
  /** Optional secondary label shown in the hover tooltip (e.g. "Apr 24"). */
  hoverLabel?: string;
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
  /** Label for the value series in the tooltip. Default: 'Revenue' for cents, 'Value' otherwise. */
  valueLabel?: string;
}

// Right padding is generous on purpose — when the SVG is downscaled onto a
// narrow mobile viewport, small viewBox units translate to only a few
// rendered pixels, and the line otherwise looks like it's running off the
// edge of the card.
const PAD = { top: 16, right: 40, bottom: 28, left: 56 };

export function AreaTrend({
  data,
  height = 220,
  showTarget = true,
  accent = 'var(--accent)',
  unit = 'cents',
  width = 800,
  className,
  valueLabel,
}: AreaTrendProps) {
  const gradId = useId();
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

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
  const fmtValue = (v: number) => (unit === 'cents' ? fmtMoney(v) : v.toLocaleString('en-US'));
  const seriesLabel = valueLabel ?? (unit === 'cents' ? 'Revenue' : 'Value');

  const labelStride = Math.max(1, Math.ceil(data.length / 8));
  const slotW = data.length > 1 ? (width - PAD.left - PAD.right) / (data.length - 1) : 0;
  const hover = hoverIdx != null ? data[hoverIdx] : null;
  const hoverX = hoverIdx != null ? xPos(hoverIdx) : null;
  const hoverY = hover ? yFor(hover.value) : null;

  return (
    <div className={`relative ${className ?? 'w-full h-full'}`}>
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      className="w-full h-full"
      role="img"
      onMouseLeave={() => setHoverIdx(null)}
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

      {/* X labels — when most labels are blank (long-window month markers
          spelt only on day-1s), render every non-blank one. Otherwise use
          a stride to avoid crowding short windows. */}
      <g>
        {(() => {
          const nonBlankCount = data.reduce((c, d) => c + (d.label ? 1 : 0), 0);
          const usePerLabel = nonBlankCount > 0 && nonBlankCount <= 16;
          return data.map((d, i) => {
            const show = usePerLabel
              ? Boolean(d.label)
              : i % labelStride === 0 || i === data.length - 1;
            if (!show || !d.label) return null;
            return (
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
            );
          });
        })()}
      </g>

      {/* Hover crosshair + dot */}
      {hover && hoverX !== null && hoverY !== null && (
        <g pointerEvents="none">
          <line
            x1={hoverX}
            x2={hoverX}
            y1={PAD.top}
            y2={height - PAD.bottom}
            stroke="var(--muted)"
            strokeOpacity={0.35}
            strokeDasharray="2 3"
          />
          <circle cx={hoverX} cy={hoverY} r={4} fill={accent} />
          <circle cx={hoverX} cy={hoverY} r={6} fill={accent} fillOpacity={0.25} />
        </g>
      )}

      {/* Hit-targets — slot width centered on each point */}
      {slotW > 0 &&
        data.map((_, i) => (
          <rect
            key={`hit-${i}`}
            x={xPos(i) - slotW / 2}
            y={PAD.top}
            width={slotW}
            height={height - PAD.top - PAD.bottom}
            fill="transparent"
            onMouseEnter={() => setHoverIdx(i)}
          />
        ))}
    </svg>

    {hover && hoverX !== null && hoverY !== null && (
      <div
        className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-md border border-border bg-surface text-[12px] px-2.5 py-1.5 shadow-lg z-10 whitespace-nowrap"
        style={{
          left: `${(hoverX / width) * 100}%`,
          top: `${(hoverY / height) * 100}%`,
          marginTop: '-10px',
        }}
      >
        <div className="font-mono tabular-nums text-[11px] text-muted mb-0.5">
          {hover.hoverLabel ?? hover.label}
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-sm" style={{ background: accent }} aria-hidden />
          <span className="text-muted">{seriesLabel}</span>
          <span className="font-mono tabular-nums">{fmtValue(hover.value)}</span>
        </div>
        {hover.target !== undefined && (
          <div className="flex items-center gap-2 text-muted">
            <span className="h-px w-2 bg-muted" aria-hidden />
            <span>Target</span>
            <span className="font-mono tabular-nums">{fmtValue(hover.target)}</span>
          </div>
        )}
      </div>
    )}
    </div>
  );
}
