'use client';

import { cn } from '@/lib/cn';
import type { Role } from '@/lib/types/kpi';

export interface RoleSubTabsProps {
  value: string;
  onChange: (code: string) => void;
  roles: Role[];
  className?: string;
}

export function RoleSubTabs({ value, onChange, roles, className }: RoleSubTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Role"
      className={cn(
        'flex items-center gap-1 p-1 bg-surface border border-border rounded-[10px] overflow-x-auto no-scrollbar',
        className,
      )}
    >
      {roles.map((r) => {
        const active = r.code === value;
        return (
          <button
            key={r.code}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(r.code)}
            className={cn(
              'shrink-0 flex flex-col items-start gap-0.5 px-3 py-1.5 rounded-[6px] transition-colors text-left',
              active
                ? 'bg-surface-2 text-text shadow-[inset_0_0_0_1px_var(--border)]'
                : 'text-muted hover:text-text hover:bg-surface-2/40',
            )}
          >
            <span className="text-[12px] font-medium leading-tight">{r.name}</span>
            <span className="text-[10px] uppercase tracking-[0.08em] opacity-70">
              {r.primaryMetric}
            </span>
          </button>
        );
      })}
    </div>
  );
}
