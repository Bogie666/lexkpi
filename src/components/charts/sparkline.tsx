import { sparkPath, sparkArea } from '@/lib/charts/scale';

export interface SparklineProps {
  values: number[];
  compareValues?: number[];
  width?: number;
  height?: number;
  stroke?: string;
  fill?: 'none' | 'area';
  className?: string;
}

export function Sparkline({
  values,
  compareValues,
  width = 80,
  height = 24,
  stroke = 'var(--accent)',
  fill = 'none',
  className,
}: SparklineProps) {
  if (!values.length) return null;
  const pathD = sparkPath(values, width, height);
  const areaD = fill === 'area' ? sparkArea(values, width, height) : null;
  const lyD = compareValues && compareValues.length
    ? sparkPath(compareValues, width, height)
    : null;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      preserveAspectRatio="none"
      className={className}
      aria-hidden="true"
    >
      {areaD && (
        <path
          d={areaD}
          fill={stroke}
          fillOpacity={0.12}
        />
      )}
      {lyD && (
        <path
          d={lyD}
          fill="none"
          stroke="var(--muted)"
          strokeOpacity={0.5}
          strokeWidth={1}
          strokeDasharray="2 2"
        />
      )}
      <path d={pathD} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
