/**
 * Turning `LedgerError` into an HTTP response and back. SERVER ONLY.
 *
 * The route handlers are a thin pipe, so a ledger rejection must survive the
 * hop as a rejection — same code, same sentence — rather than becoming a
 * generic 500 that the desk cannot act on.
 */

import { NextResponse } from 'next/server';

import { AuthError } from '../../auth/server/policy';
import { LedgerError, type LedgerErrorCode } from '../client';
import type { WireError } from '../wire';

const STATUS: Record<LedgerErrorCode, number> = {
  NOT_FOUND: 404,
  NOT_AUTHORIZED: 403,
  PRECONDITION_FAILED: 409,
  CONTRACT_NOT_ACTIVE: 409,
  INVALID_ARGUMENT: 400,
  UNAVAILABLE: 503,
};

export function errorResponse(cause: unknown): NextResponse<WireError> {
  // No session (401) or a session acting outside its seat (403). Same wire
  // shape as a ledger rejection, so the desk renders it the same way.
  if (cause instanceof AuthError) {
    return NextResponse.json(
      { error: { code: 'NOT_AUTHORIZED', message: cause.message } },
      { status: cause.status },
    );
  }
  const error =
    cause instanceof LedgerError
      ? cause
      : new LedgerError('UNAVAILABLE', cause instanceof Error ? cause.message : 'Ledger call failed.');
  if (!(cause instanceof LedgerError)) console.error('[ledger] unexpected failure', cause);
  return NextResponse.json(
    { error: { code: error.code, message: error.message } },
    { status: STATUS[error.code] },
  );
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new LedgerError('INVALID_ARGUMENT', 'Malformed request body.');
  }
}
