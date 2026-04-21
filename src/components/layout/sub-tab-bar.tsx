'use client';

import { cn } from '@/lib/cn';

export interface SubTabBarProps {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ id: string; label: string }>;
  className?: string;
}

export function SubTabBar({ value, onChange, options, className }: SubTabBarProps) {
  return (
    <div
      role="tablist"
      className={cn(
        'inline-flex items-center gap-0.5 p-1 bg-surface border border-border rounded-[10px]',
        className,
      )}
    >
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.id)}
            className={cn(
              'text-[12px] font-medium px-3 py-1.5 rounded-[6px] transition-colors',
              active
                ? 'bg-surface-2 text-text shadow-[inset_0_0_0_1px_var(--border)]'
                : 'text-muted hover:text-text hover:bg-surface-2/40',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
