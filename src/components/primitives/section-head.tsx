import { cn } from '@/lib/cn';

export interface SectionHeadProps {
  eyebrow?: string;
  title: string;
  right?: React.ReactNode;
  className?: string;
}

export function SectionHead({ eyebrow, title, right, className }: SectionHeadProps) {
  return (
    <header className={cn('flex items-end justify-between gap-4 flex-wrap', className)}>
      <div className="flex flex-col gap-2">
        {eyebrow && (
          <span className="text-eyebrow uppercase text-muted">{eyebrow}</span>
        )}
        <h2 className="text-section">{title}</h2>
      </div>
      {right && <div className="flex items-center gap-3 flex-wrap">{right}</div>}
    </header>
  );
}
