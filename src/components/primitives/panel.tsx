import { cn } from '@/lib/cn';

export interface PanelProps {
  title?: string;
  eyebrow?: string;
  right?: React.ReactNode;
  padding?: 'cozy' | 'tight' | 'none';
  className?: string;
  children: React.ReactNode;
}

const PAD_CLS = {
  cozy: 'p-6',
  tight: 'p-4',
  none: '',
};

export function Panel({ title, eyebrow, right, padding = 'cozy', className, children }: PanelProps) {
  return (
    <section
      className={cn(
        'bg-surface border border-border rounded-panel',
        PAD_CLS[padding],
        className,
      )}
    >
      {(title || eyebrow || right) && (
        <header className="flex items-start justify-between gap-4 mb-4">
          <div className="flex flex-col gap-1">
            {eyebrow && (
              <span className="text-eyebrow uppercase text-muted">{eyebrow}</span>
            )}
            {title && <h3 className="text-panel">{title}</h3>}
          </div>
          {right && <div className="flex items-center gap-2 shrink-0">{right}</div>}
        </header>
      )}
      {children}
    </section>
  );
}
