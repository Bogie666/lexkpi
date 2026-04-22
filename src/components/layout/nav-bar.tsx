'use client';

import { RefreshCw } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { TabBar } from './tab-bar';
import { LiveDot } from '@/components/primitives/live-dot';
import { cn } from '@/lib/cn';
import type { Tab, CompareMode } from '@/lib/state/url-params';
import { COMPARE_SUPPORTED } from '@/lib/state/url-params';

export interface NavBarProps {
  activeTab: Tab;
  onTabChange: (t: Tab) => void;
  compareMode: CompareMode;
  onCompareChange: (m: CompareMode) => void;
}

export function NavBar({ activeTab, onTabChange, compareMode, onCompareChange }: NavBarProps) {
  const qc = useQueryClient();
  const supportsCompare = COMPARE_SUPPORTED[activeTab];
  const compareOn = compareMode !== 'none';
  const compareYear = compareMode === 'ly2' ? 'ly2' : 'ly';

  return (
    <header
      className={cn(
        'sticky top-0 z-10',
        'border-b border-border',
        'backdrop-blur-[12px]',
        'bg-[color:var(--nav-bg)]',
      )}
    >
      {/* Row 1: brand + right cluster (single row on md+, top row on mobile) */}
      <div className="flex items-center justify-between gap-4 px-4 md:px-[var(--density-pad-x)] h-14 md:h-16">
        {/* Brand */}
        <div className="flex items-center gap-3 shrink-0">
          <div
            className="h-8 w-8 rounded-lg shrink-0"
            style={{
              background:
                'linear-gradient(135deg, var(--accent) 0%, color-mix(in oklch, var(--accent) 70%, var(--d-commercial)) 100%)',
            }}
            aria-hidden="true"
          />
          <div className="hidden md:flex flex-col leading-tight">
            <span className="text-[13px] font-semibold tracking-tight">Lex KPI</span>
            <span className="text-[11px] text-muted">Service Star Brands</span>
          </div>
        </div>

        {/* Tabs — inline on md+, on their own row on sm */}
        <div className="hidden md:block flex-1 min-w-0 overflow-x-auto no-scrollbar">
          <TabBar active={activeTab} onChange={onTabChange} />
        </div>

        {/* Right cluster */}
        <div className="flex items-center gap-2 md:gap-3 shrink-0">
          {supportsCompare && (
            <div className="flex items-center gap-1 p-1 bg-surface border border-border rounded-btn">
              <button
                onClick={() => onCompareChange(compareOn ? 'none' : 'ly')}
                className={cn(
                  'text-[12px] font-medium px-2.5 py-1 rounded-[6px] transition-colors',
                  compareOn
                    ? 'bg-surface-2 text-text shadow-[inset_0_0_0_1px_var(--border)]'
                    : 'text-muted hover:text-text',
                )}
                aria-pressed={compareOn}
              >
                Compare
              </button>
              {compareOn && (
                <div className="flex items-center gap-0.5 border-l border-border pl-1 ml-0.5">
                  {(['ly', 'ly2'] as const).map((y) => (
                    <button
                      key={y}
                      onClick={() => onCompareChange(y)}
                      className={cn(
                        'text-[11px] font-mono tabular-nums px-2 py-0.5 rounded-[4px]',
                        y === compareYear
                          ? 'bg-surface-2 text-text'
                          : 'text-muted hover:text-text',
                      )}
                    >
                      {y === 'ly' ? '2025' : '2024'}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <button
            onClick={() => qc.invalidateQueries()}
            className="p-2 rounded-btn text-muted hover:text-text hover:bg-surface-2/60 transition-colors"
            aria-label="Refresh"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </button>

          <div className="hidden md:block">
            <LiveDot size="sm" />
          </div>
        </div>
      </div>

      {/* Row 2 on mobile — full-width tab bar, horizontally scrollable with edge fades.
          Hidden on md+ since tabs live inline in row 1 there. */}
      <div className="md:hidden relative border-t border-border/50">
        <div className="overflow-x-auto no-scrollbar px-3 py-2">
          <TabBar active={activeTab} onChange={onTabChange} />
        </div>
        {/* Soft fade on right edge to hint at horizontal scroll */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-0 right-0 h-full w-6"
          style={{
            background: 'linear-gradient(90deg, transparent, var(--nav-bg))',
          }}
        />
      </div>
    </header>
  );
}
