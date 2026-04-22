import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'ghost' | 'danger' | 'default';
export type ButtonSize = 'sm' | 'md';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const VARIANT: Record<ButtonVariant, string> = {
  default:
    'bg-surface-2 text-text border border-border hover:border-accent/60 hover:text-accent',
  primary:
    'bg-accent text-bg border border-accent hover:opacity-90',
  ghost:
    'bg-transparent text-muted border border-transparent hover:text-text hover:bg-surface-2/60',
  danger:
    'bg-down-bg text-down border border-down/30 hover:border-down/60',
};

const SIZE: Record<ButtonSize, string> = {
  sm: 'text-[12px] px-2.5 py-1 gap-1.5',
  md: 'text-[13px] px-3 py-1.5 gap-2',
};

export function Button({
  variant = 'default',
  size = 'md',
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center rounded-btn font-medium transition-colors',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...rest}
    />
  );
}
