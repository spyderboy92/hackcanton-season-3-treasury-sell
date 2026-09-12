/**
 * Exact decimal arithmetic over strings, backed by BigInt.
 *
 * Money never touches an IEEE-754 float in this application. Every price,
 * quantity and notional stays a string from the ledger to the DOM.
 */

import type { Decimal } from './ledger/types';

interface Parts {
  neg: boolean;
  digits: bigint;
  scale: number;
}

const DECIMAL_RE = /^([+-]?)(\d*)(?:\.(\d*))?$/;

export function isDecimal(value: string): boolean {
  const m = DECIMAL_RE.exec(value.trim());
  if (!m) return false;
  const int = m[2] ?? '';
  const frac = m[3] ?? '';
  return int.length + frac.length > 0;
}

function parse(value: string, label = 'decimal'): Parts {
  const m = DECIMAL_RE.exec(value.trim());
  const int = m?.[2] ?? '';
  const frac = m?.[3] ?? '';
  if (!m || int.length + frac.length === 0) {
    throw new TypeError(`Not a ${label}: ${JSON.stringify(value)}`);
  }
  return {
    neg: (m[1] ?? '') === '-',
    digits: BigInt((int || '0') + frac),
    scale: frac.length,
  };
}

function render(p: Parts): Decimal {
  const raw = p.digits.toString().padStart(p.scale + 1, '0');
  const cut = raw.length - p.scale;
  const int = raw.slice(0, cut);
  const frac = p.scale > 0 ? raw.slice(cut) : '';
  const sign = p.neg && p.digits !== 0n ? '-' : '';
  return frac ? `${sign}${int}.${frac}` : `${sign}${int}`;
}

function rescale(p: Parts, scale: number): bigint {
  const signed = p.neg ? -p.digits : p.digits;
  if (scale === p.scale) return signed;
  return signed * 10n ** BigInt(scale - p.scale);
}

/** Strip trailing fractional zeros but keep at least `keep` decimal places. */
export function trim(value: Decimal, keep = 0): Decimal {
  const p = parse(value);
  let { digits, scale } = p;
  while (scale > keep && digits % 10n === 0n) {
    digits /= 10n;
    scale -= 1;
  }
  return render({ neg: p.neg, digits, scale });
}

export function add(a: Decimal, b: Decimal): Decimal {
  const pa = parse(a);
  const pb = parse(b);
  const scale = Math.max(pa.scale, pb.scale);
  const sum = rescale(pa, scale) + rescale(pb, scale);
  return render({ neg: sum < 0n, digits: sum < 0n ? -sum : sum, scale });
}

export function subtract(a: Decimal, b: Decimal): Decimal {
  const pb = parse(b);
  return add(a, render({ neg: !pb.neg, digits: pb.digits, scale: pb.scale }));
}

export function multiply(a: Decimal, b: Decimal): Decimal {
  const pa = parse(a);
  const pb = parse(b);
  return render({
    neg: pa.neg !== pb.neg,
    digits: pa.digits * pb.digits,
    scale: pa.scale + pb.scale,
  });
}

/** Divide to a fixed number of decimal places, truncating toward zero. */
export function divide(a: Decimal, b: Decimal, scale = 10): Decimal {
  const pa = parse(a);
  const pb = parse(b);
  if (pb.digits === 0n) throw new RangeError('Division by zero');
  const shift = 10n ** BigInt(scale + pb.scale);
  const digits = (pa.digits * shift) / (pb.digits * 10n ** BigInt(pa.scale));
  return render({ neg: pa.neg !== pb.neg, digits, scale });
}

/** -1 | 0 | 1 */
export function compare(a: Decimal, b: Decimal): number {
  const pa = parse(a);
  const pb = parse(b);
  const scale = Math.max(pa.scale, pb.scale);
  const va = rescale(pa, scale);
  const vb = rescale(pb, scale);
  return va < vb ? -1 : va > vb ? 1 : 0;
}

export function isZero(value: Decimal): boolean {
  return parse(value).digits === 0n;
}

export function isPositive(value: Decimal): boolean {
  const p = parse(value);
  return p.digits > 0n && !p.neg;
}

/** Round half-away-from-zero to `dp` decimal places. */
export function round(value: Decimal, dp: number): Decimal {
  const p = parse(value);
  if (p.scale <= dp) {
    return render({ neg: p.neg, digits: p.digits * 10n ** BigInt(dp - p.scale), scale: dp });
  }
  const factor = 10n ** BigInt(p.scale - dp);
  const q = p.digits / factor;
  const r = p.digits % factor;
  const digits = r * 2n >= factor ? q + 1n : q;
  return render({ neg: p.neg, digits, scale: dp });
}

/** Difference of `value` from `reference`, expressed in basis points. */
export function basisPoints(value: Decimal, reference: Decimal): Decimal {
  if (isZero(reference)) return '0.0';
  return round(multiply(divide(subtract(value, reference), reference, 12), '10000'), 1);
}

export interface FormatOptions {
  /** Exact number of decimal places to render. Defaults to the value's own. */
  dp?: number;
  /** Insert thousands separators. Default true. */
  group?: boolean;
  /** Always render a leading + for positive values. */
  signed?: boolean;
}

/** Format a decimal string for display. Never returns "NaN". */
export function format(value: Decimal, options: FormatOptions = {}): string {
  const { dp, group = true, signed = false } = options;
  if (!isDecimal(value)) return '—';
  const fixed = dp === undefined ? render(parse(value)) : round(value, dp);
  const neg = fixed.startsWith('-');
  const bare = neg ? fixed.slice(1) : fixed;
  const dot = bare.indexOf('.');
  const int = dot === -1 ? bare : bare.slice(0, dot);
  const frac = dot === -1 ? '' : bare.slice(dot + 1);
  const grouped = group ? int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : int;
  const sign = neg ? '-' : signed ? '+' : '';
  return frac ? `${sign}${grouped}.${frac}` : `${sign}${grouped}`;
}

/** Conventional display precision per instrument. */
export const PRECISION: Record<string, number> = {
  USD: 2,
  EUR: 2,
  GBP: 2,
  cETH: 4,
  CBTC: 8,
};

export function precisionFor(symbol: string): number {
  return PRECISION[symbol] ?? 2;
}
