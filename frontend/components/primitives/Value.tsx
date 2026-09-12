import { format, precisionFor } from '@/lib/decimal';
import { cn } from '@/lib/cn';

/** A price, quantity or notional. Always monospace, always tabular. */
export function Amount({
  value,
  symbol,
  dp,
  className,
  showSymbol = false,
  emphasis = 'normal',
}: {
  value: string;
  symbol?: string;
  dp?: number;
  className?: string;
  showSymbol?: boolean;
  emphasis?: 'normal' | 'strong' | 'quiet';
}) {
  const places = dp ?? (symbol ? precisionFor(symbol) : undefined);
  return (
    <span
      className={cn(
        'num whitespace-nowrap',
        emphasis === 'strong' && 'font-medium text-ink',
        emphasis === 'quiet' && 'text-ink-2',
        className,
      )}
    >
      {format(value, { dp: places })}
      {showSymbol && symbol ? <span className="ml-1 text-ink-3">{symbol}</span> : null}
    </span>
  );
}

/** Basis-point deviation. Zero renders as a dash so the best row stays quiet. */
export function BasisPoints({ value, className }: { value: string; className?: string }) {
  const zero = /^-?0(\.0+)?$/.test(value);
  return (
    <span className={cn('num whitespace-nowrap', zero ? 'text-ink-4' : 'text-ink-2', className)}>
      {zero ? '—' : `${format(value, { dp: 1, signed: true })} bp`}
    </span>
  );
}
