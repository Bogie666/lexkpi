'use client';

import { cn } from '@/lib/cn';
import { PRESETS, type Preset } from '@/lib/state/url-params';
import { PRESET_LABELS } from '@/lib/format/date';

export interface PeriodTabsProps {
  value: Preset;
  onChange: (p: Preset) => void;
  options?: readonly Preset[];
  className?: string;
}

const DEFAULT_OPTIONS: readonly Preset[] = ['mtd', 'qtd', 'ytd', 'last_month', 'ttm'];

export function PeriodTabs({ value, onChange, options = DEFAULT_OPTIONS, className }: PeriodTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Period"
      className={cn(
        'inline-flex items-center gap-0.5 p-1 bg-surface border border-border rounded-btn',
        className,
      )}
    >
      {options.map((p) => {
        const active = p === value;
        return (
          <button
            key={p}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(p)}
            className={cn(
              'text-[12px] font-medium px-2.5 py-1 rounded-[6px] transition-colors',
              active
                ? 'bg-surface-2 text-text shadow-[inset_0_0_0_1px_var(--border)]'
                : 'text-muted hover:text-text hover:bg-surface-2/40',
            )}
          >
            {PRESET_LABELS[p] ?? p}
          </button>
        );
      })}
    </div>
  );
}

// Silence unused import in the barrel case.
export { PRESETS };
