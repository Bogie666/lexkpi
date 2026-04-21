'use client';

import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { Insight } from '@/lib/insights/financial';

export interface CompareBannerProps {
  insights: Insight[];
  mode: 'ly' | 'ly2';
  className?: string;
}

const TONE_CLS = {
  up: 'border-l-up text-up',
  down: 'border-l-down text-down',
  neutral: 'border-l-muted text-muted',
} as const;

const TONE_ICON = {
  up: TrendingUp,
  down: TrendingDown,
  neutral: Minus,
} as const;

export function CompareBanner({ insights, mode, className }: CompareBannerProps) {
  if (!insights.length) return null;

  return (
    <section
      className={cn(
        'bg-surface border border-border rounded-panel px-5 py-4 flex flex-col gap-3',
        className,
      )}
      aria-label="Auto-insights"
    >
      <header className="flex items-center justify-between text-[11px] uppercase tracking-[0.08em]">
        <span className="text-muted">Auto-insights</span>
        <span className="text-muted font-mono tabular-nums">
          vs {mode === 'ly2' ? '2 years ago' : 'last year'}
        </span>
      </header>
      <div className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
        {insights.map((ins, i) => {
          const Icon = TONE_ICON[ins.tone];
          return (
            <div
              key={i}
              className={cn(
                'border-l-2 pl-3 py-1 flex items-start gap-2.5',
                TONE_CLS[ins.tone],
              )}
            >
              <Icon className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
              <div className="flex flex-col gap-1 min-w-0">
                <div className="text-[13px] font-medium text-text leading-tight">{ins.title}</div>
                <div className="text-[12px] text-muted font-mono tabular-nums">{ins.sub}</div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
