'use client';

import { useMemo, useState } from 'react';
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
  /** Label for the highlighted series in the tooltip. */
  highlightedLabel?: string;
  /** Label for the total series in the tooltip. */
  totalLabel?: string;
  /** Optional formatter for tooltip values. Default = toLocaleString. */
  fmtValue?: (n: number) => string;
  height?: number;
  width?: number;
  className?: string;
}

const PAD = { top: 16, right: 16, bottom: 32, left: 40 };

export function StackedBars({
  data,
  compareMode = 'none',
  accentHighlight = 'var(--accent)',
  highlightedLabel = 'Booked',
  totalLabel = 'Calls',
  fmtValue = (n) => n.toLocaleString('en-US'),
  height = 260,
  width = 720,
  className,
}: StackedBarsProps) {
  const compareOn = compareMode === 'ly' || compareMode === 'ly2';
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const { bars, ticks, barW, lyMark, slot } = useMemo(() => {
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

    return { bars, ticks, barW, lyMark, slot };
  }, [data, compareOn, height, width]);

  const yFor = (v: number) => {
    const max = ticks[ticks.length - 1] || 1;
    return height - PAD.bottom - (v / max) * (height - PAD.top - PAD.bottom);
  };

  const hover = hoverIdx != null ? data[hoverIdx] : null;
  const hoverBar = hoverIdx != null ? bars[hoverIdx] : null;

  return (
    <div className={`relative ${className ?? 'w-full h-full'}`}>
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      className="w-full h-full"
      role="img"
      onMouseLeave={() => setHoverIdx(null)}
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
      {(() => {
        // Stride x-axis labels so they don't overlap when there are many
        // bars (24 hours easily crowds out at narrow viewports).
        const labelStride = bars.length > 12 ? Math.ceil(bars.length / 8) : 1;
        return bars.map((b) => (
          <g key={b.i}>
            <rect
              x={b.xLeft}
              y={b.totalTop}
              width={barW}
              height={Math.max(b.totalHeight, 0)}
              rx={3}
              fill="var(--muted)"
              fillOpacity={hoverIdx === b.i ? 0.32 : 0.18}
            />
            <rect
              x={b.xLeft}
              y={b.bookedTop}
              width={barW}
              height={Math.max(b.bookedHeight, 0)}
              rx={3}
              fill={accentHighlight}
              fillOpacity={hoverIdx == null || hoverIdx === b.i ? 1 : 0.55}
            />
            {(b.i % labelStride === 0 || b.i === bars.length - 1) && (
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
            )}
          </g>
        ));
      })()}

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

      {/* Hover hit-targets — full slot width so there's no dead space
          between bars. Highlight the active column with a soft band. */}
      {hoverBar && (
        <rect
          x={PAD.left + slot * hoverBar.i}
          y={PAD.top}
          width={slot}
          height={height - PAD.top - PAD.bottom}
          fill="var(--accent)"
          fillOpacity={0.06}
          pointerEvents="none"
        />
      )}
      {bars.map((b) => (
        <rect
          key={`hit-${b.i}`}
          x={PAD.left + slot * b.i}
          y={PAD.top}
          width={slot}
          height={height - PAD.top - PAD.bottom}
          fill="transparent"
          onMouseEnter={() => setHoverIdx(b.i)}
        />
      ))}
    </svg>

    {/* Tooltip — positioned in DOM space (% of container width). */}
    {hover && hoverBar && (
      <div
        className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-md border border-border bg-surface text-[12px] px-2.5 py-1.5 shadow-lg z-10"
        style={{
          left: `${((PAD.left + slot * (hoverBar.i + 0.5)) / width) * 100}%`,
          top: `${(hoverBar.bookedTop / height) * 100}%`,
          marginTop: '-8px',
        }}
      >
        <div className="font-mono tabular-nums text-[11px] text-muted mb-0.5">{hover.label}</div>
        <div className="flex items-center gap-2 whitespace-nowrap">
          <span className="h-2 w-2 rounded-sm" style={{ background: accentHighlight }} aria-hidden />
          <span className="text-muted">{highlightedLabel}</span>
          <span className="font-mono tabular-nums">{fmtValue(hover.highlighted)}</span>
        </div>
        <div className="flex items-center gap-2 whitespace-nowrap">
          <span className="h-2 w-2 rounded-sm bg-muted/30" aria-hidden />
          <span className="text-muted">{totalLabel}</span>
          <span className="font-mono tabular-nums">{fmtValue(hover.total)}</span>
        </div>
        {hover.total > 0 && (
          <div className="text-[11px] text-muted mt-0.5 font-mono tabular-nums">
            {Math.round((hover.highlighted / hover.total) * 100)}% booked
          </div>
        )}
        {compareOn && hover.lyHighlighted !== undefined && (
          <div className="text-[11px] text-muted/80 mt-0.5 font-mono tabular-nums">
            LY {highlightedLabel.toLowerCase()}: {fmtValue(hover.lyHighlighted)}
          </div>
        )}
      </div>
    )}
    </div>
  );
}
