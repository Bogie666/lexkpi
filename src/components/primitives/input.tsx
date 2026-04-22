import { cn } from '@/lib/cn';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export function Input({ className, type = 'text', ...rest }: InputProps) {
  return (
    <input
      type={type}
      className={cn(
        'bg-surface border border-border rounded-btn',
        'text-[13px] text-text placeholder:text-muted',
        'px-2.5 py-1.5',
        'focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        'w-full',
        type === 'number' && 'font-mono tabular-nums',
        className,
      )}
      {...rest}
    />
  );
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {}

export function Select({ className, children, ...rest }: SelectProps) {
  return (
    <select
      className={cn(
        'bg-surface border border-border rounded-btn',
        'text-[13px] text-text',
        'px-2.5 py-1.5',
        'focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        'w-full',
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  );
}

export interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}

export function Field({ label, hint, error, className, children }: FieldProps) {
  return (
    <label className={cn('flex flex-col gap-1.5', className)}>
      <span className="text-eyebrow uppercase text-muted">{label}</span>
      {children}
      {error && <span className="text-[11px] text-down">{error}</span>}
      {hint && !error && <span className="text-[11px] text-muted">{hint}</span>}
    </label>
  );
}
