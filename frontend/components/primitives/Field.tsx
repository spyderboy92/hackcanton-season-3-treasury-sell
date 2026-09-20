'use client';

import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { useId } from 'react';

import { cn } from '@/lib/cn';

const CONTROL =
  'h-8 w-full rounded-xs border border-line-hi bg-canvas px-2 text-ink ' +
  'placeholder:text-ink-4 focus:border-accent focus:outline-none transition-colors';

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn('block', className)}>
      <span className="label mb-1 block">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-mini text-ink-3">{hint}</span> : null}
    </label>
  );
}

export interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  mono?: boolean;
  suffix?: string;
}

export function TextInput({ mono = false, suffix, className, ...rest }: TextInputProps) {
  return (
    <span className="relative block">
      <input
        {...rest}
        className={cn(CONTROL, mono && 'num', suffix && 'pr-12', 'text-xs', className)}
      />
      {suffix ? (
        <span className="num pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-mini text-ink-3">
          {suffix}
        </span>
      ) : null}
    </span>
  );
}

export function Select({
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...rest} className={cn(CONTROL, 'appearance-none text-xs', className)}>
      {children}
    </select>
  );
}

export function CheckRow({
  checked,
  onChange,
  primary,
  secondary,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  primary: ReactNode;
  secondary?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className={cn(
        'flex cursor-pointer items-center gap-2.5 border-b border-line-quiet px-3 py-2 last:border-b-0',
        checked ? 'bg-accent-wash' : 'hover:bg-raised',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="size-3 shrink-0 accent-[var(--accent)]"
      />
      <span className="min-w-0 flex-1 text-xs">{primary}</span>
      {secondary ? <span className="shrink-0">{secondary}</span> : null}
    </label>
  );
}
