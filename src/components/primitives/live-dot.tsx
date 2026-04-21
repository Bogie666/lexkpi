import { cn } from '@/lib/cn';

export interface LiveDotProps {
  size?: 'sm' | 'md';
  label?: string;
}

export function LiveDot({ size = 'md', label = 'Live' }: LiveDotProps) {
  const dim = size === 'sm' ? 'h-1.5 w-1.5' : 'h-2 w-2';
  return (
    <span className="inline-flex items-center gap-2">
      <span className="relative inline-flex">
        <span
          className={cn(
            'rounded-full bg-up animate-live-pulse',
            dim,
            'shadow-[0_0_0_3px_color-mix(in_oklch,var(--up)_20%,transparent)]',
          )}
        />
      </span>
      <span className="text-eyebrow uppercase text-muted">{label}</span>
    </span>
  );
}
