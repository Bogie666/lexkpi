'use client';

import { cn } from '@/lib/cn';
import { TABS, type Tab } from '@/lib/state/url-params';

const LABELS: Record<Tab, string> = {
  financial: 'Financial',
  appointments: 'Appointments',
  technicians: 'Technicians',
  operations: 'Operations',
  engagement: 'Engagement',
  analyze: 'Analyze',
  tools: 'Tools',
};

const SHORT: Record<Tab, string> = {
  financial: 'Fin',
  appointments: 'Appts',
  technicians: 'Tech',
  operations: 'Ops',
  engagement: 'Eng',
  analyze: 'Anz',
  tools: 'Tools',
};

export interface TabBarProps {
  active: Tab;
  onChange: (t: Tab) => void;
  className?: string;
}

export function TabBar({ active, onChange, className }: TabBarProps) {
  return (
    <nav role="tablist" aria-label="Dashboard tabs" className={cn('flex items-center gap-0.5', className)}>
      {TABS.map((t) => {
        const isActive = t === active;
        return (
          <button
            key={t}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(t)}
            className={cn(
              'relative text-[13px] font-medium px-3.5 py-2 rounded-btn transition-colors',
              isActive
                ? 'bg-surface-2 text-text shadow-[inset_0_0_0_1px_var(--border)]'
                : 'text-muted hover:text-text hover:bg-surface-2/40',
            )}
          >
            <span className="hidden sm:inline">{LABELS[t]}</span>
            <span className="sm:hidden">{SHORT[t]}</span>
            {isActive && (
              <span
                aria-hidden="true"
                className="absolute -bottom-[9px] left-1/2 -translate-x-1/2 h-[2px] w-6 bg-accent rounded-full"
              />
            )}
          </button>
        );
      })}
    </nav>
  );
}
