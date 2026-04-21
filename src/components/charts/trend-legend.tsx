import { cn } from '@/lib/cn';

export interface TrendLegendProps {
  mode?: 'ly' | 'ly2';
  showTarget?: boolean;
  accent?: string;
  className?: string;
}

export function TrendLegend({
  mode = 'ly',
  showTarget = true,
  accent = 'var(--accent)',
  className,
}: TrendLegendProps) {
  return (
    <div className={cn('flex items-center gap-4 flex-wrap text-[11px] text-muted', className)}>
      <LegendItem label="This year" swatch={<Swatch style={{ background: accent }} />} />
      <LegendItem
        label={mode === 'ly2' ? 'Last year' : 'Last year'}
        swatch={<Swatch dashed style={{ background: 'var(--muted)', opacity: 0.7 }} />}
      />
      {mode === 'ly2' && (
        <LegendItem
          label="2 years ago"
          swatch={<Swatch dashed style={{ background: 'var(--muted)', opacity: 0.5 }} />}
        />
      )}
      {showTarget && (
        <LegendItem
          label="Target"
          swatch={<Swatch dashed style={{ background: 'var(--muted)', opacity: 0.5 }} />}
        />
      )}
    </div>
  );
}

function LegendItem({ swatch, label }: { swatch: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {swatch}
      <span className="uppercase tracking-[0.08em]">{label}</span>
    </span>
  );
}

function Swatch({ dashed, style }: { dashed?: boolean; style?: React.CSSProperties }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-[2px] w-4 rounded-full"
      style={{
        ...style,
        backgroundImage: dashed
          ? 'repeating-linear-gradient(90deg, currentColor 0 4px, transparent 4px 7px)'
          : undefined,
        color: style?.background as string | undefined,
      }}
    />
  );
}
