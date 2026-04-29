'use client';

interface TvHeaderProps {
  eyebrow: string;
  title: string;
  right?: React.ReactNode;
}

export function TvHeader({ eyebrow, title, right }: TvHeaderProps) {
  return (
    <header className="flex items-end justify-between gap-4 mb-4">
      <div className="flex flex-col gap-1">
        <span className="text-eyebrow uppercase text-muted tracking-[0.12em]">{eyebrow}</span>
        <h1 className="text-section font-semibold leading-tight">{title}</h1>
      </div>
      {right && <div className="text-[16px] text-muted font-mono tabular-nums">{right}</div>}
    </header>
  );
}
