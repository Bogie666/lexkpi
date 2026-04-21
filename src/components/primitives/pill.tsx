import { cn } from '@/lib/cn';

export type PillTone = 'default' | 'up' | 'down' | 'warning' | 'accent';

export interface PillProps {
  tone?: PillTone;
  size?: 'sm' | 'md';
  className?: string;
  children: React.ReactNode;
}

const TONE_CLS: Record<PillTone, string> = {
  default: 'bg-surface-2 text-muted',
  up: 'bg-up-bg text-up',
  down: 'bg-down-bg text-down',
  warning: 'bg-warning-bg text-warning',
  accent: 'bg-accent-bg text-accent',
};

const SIZE_CLS = {
  sm: 'text-[11px] px-1.5 py-0.5 gap-1',
  md: 'text-[12px] px-2 py-0.5 gap-1',
};

export function Pill({ tone = 'default', size = 'md', className, children }: PillProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-pill font-mono tabular-nums font-medium whitespace-nowrap leading-none',
        TONE_CLS[tone],
        SIZE_CLS[size],
        className,
      )}
    >
      {children}
    </span>
  );
}
