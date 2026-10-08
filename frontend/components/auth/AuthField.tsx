'use client';

import { useId, type ReactElement, type ReactNode } from 'react';
import { cloneElement } from 'react';

/**
 * A labelled control with an optional hint and field error. The error is wired
 * to the control through `aria-describedby` / `aria-invalid`, so a screen
 * reader announces "Username, invalid entry, username is already taken"
 * rather than leaving the message floating near the box.
 */
export function AuthField({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  children: ReactElement<Record<string, unknown>>;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className="block">
      <label htmlFor={id} className="label mb-1 block">
        {label}
      </label>
      {cloneElement(children, {
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy,
      })}
      {hint ? (
        <span id={hintId} className="mt-1 block text-mini text-ink-3">
          {hint}
        </span>
      ) : null}
      {error ? (
        <span id={errorId} className="mt-1 block text-mini text-neg">
          {error}
        </span>
      ) : null}
    </div>
  );
}
