import type { ButtonHTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

const VARIANT: Record<Variant, string> = {
  primary:
    'bg-accent text-accent-ink border-accent hover:bg-accent-hi hover:border-accent-hi font-medium',
  secondary: 'bg-surface text-ink border-line-hi hover:border-ink-3 hover:bg-raised',
  ghost: 'bg-transparent text-ink-2 border-transparent hover:text-ink hover:border-line-hi',
  danger: 'bg-transparent text-neg border-line-hi hover:bg-neg-wash hover:border-neg',
};

const SIZE: Record<Size, string> = {
  sm: 'h-6 px-2 text-mini',
  md: 'h-8 px-3 text-xs',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  busy?: boolean;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  busy = false,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || busy}
      data-busy={busy || undefined}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-xs border',
        'whitespace-nowrap transition-colors duration-100',
        'disabled:cursor-not-allowed disabled:opacity-40',
        VARIANT[variant],
        SIZE[size],
        className,
      )}
    >
      {busy ? <span className="breathe">·</span> : null}
      {children}
    </button>
  );
}
