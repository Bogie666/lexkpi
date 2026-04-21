import { cn } from '@/lib/cn';

type Variant = 'text' | 'stat' | 'chart' | 'table-row' | 'avatar';

export interface SkeletonProps {
  variant: Variant;
  count?: number;
  className?: string;
}

const BASE = 'animate-pulse bg-surface-2 rounded';

export function Skeleton({ variant, count = 1, className }: SkeletonProps) {
  const items = Array.from({ length: count });
  return (
    <>
      {items.map((_, i) => {
        switch (variant) {
          case 'text':
            return <div key={i} className={cn(BASE, 'h-4 w-40', className)} />;
          case 'stat':
            return (
              <div key={i} className={cn('flex flex-col gap-2', className)}>
                <div className={cn(BASE, 'h-3 w-24')} />
                <div className={cn(BASE, 'h-8 w-32')} />
              </div>
            );
          case 'chart':
            return <div key={i} className={cn(BASE, 'h-48 w-full', className)} />;
          case 'table-row':
            return <div key={i} className={cn(BASE, 'h-10 w-full', className)} />;
          case 'avatar':
            return <div key={i} className={cn(BASE, 'h-12 w-12 rounded-full', className)} />;
        }
      })}
    </>
  );
}
