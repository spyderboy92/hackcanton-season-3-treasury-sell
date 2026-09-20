/**
 * Request-shape validation at the HTTP boundary. SERVER ONLY.
 *
 * `readJson` parses untrusted bytes; a cast to `CommandRequest` is a promise the
 * caller made, not a fact. Without this file a body missing `invitedDealers`
 * reached the wire layer and surfaced as a `TypeError` mapped to 503 — telling
 * the operator the ledger was down when the request was simply malformed — and a
 * `kind` matching no `case` fell out of the switch in `ledger.ts` and returned
 * 200 with an empty body.
 *
 * So every field the handlers go on to read is checked here, and anything that
 * fails is an `INVALID_ARGUMENT` (400) naming the field. This is a shape check,
 * not a business-rule check: whether a party may do a thing is the ledger's
 * answer to give, and asking it here would be the very mistake the project
 * exists to demonstrate against.
 */

import { LedgerError, type LedgerTemplate } from '../client';
import type { CommandRequest, CommandKind, QueryRequest } from '../wire';

/**
 * Both sets are records keyed by the union, not lists of it: a list only proves
 * that everything in it is a member, so a new `CommandRequest` variant left out
 * of one would typecheck here and then 400 at the boundary — with the AGENTS §7
 * recipe telling the next contributor the work is done. `Record<CommandKind, true>`
 * is total, so the omission is a compile error instead.
 */
const KINDS = {
  createRfq: true,
  closeRfq: true,
  cancelRfq: true,
  acceptQuote: true,
  submitQuote: true,
  reviseQuote: true,
  withdrawQuote: true,
  declineInvitation: true,
  allocateAsset: true,
  settle: true,
} satisfies Record<CommandKind, true>;

const TEMPLATES = {
  RFQ: true,
  RfqInvitation: true,
  Quote: true,
  AcceptedTrade: true,
  SettlementInstruction: true,
  SettlementReceipt: true,
  TokenHolding: true,
} satisfies Record<LedgerTemplate, true>;

const SIDES = ['Buy', 'Sell'] as const;
type ValidatedSide = (typeof SIDES)[number];

function isKind(v: unknown): v is CommandKind {
  return typeof v === 'string' && Object.hasOwn(KINDS, v);
}

function isTemplate(v: unknown): v is LedgerTemplate {
  return typeof v === 'string' && Object.hasOwn(TEMPLATES, v);
}

function isSide(v: unknown): v is ValidatedSide {
  return typeof v === 'string' && (SIDES as readonly string[]).includes(v);
}

function invalid(message: string): never {
  throw new LedgerError('INVALID_ARGUMENT', message);
}

function object(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    invalid('Request body must be a JSON object.');
  }
  return body as Record<string, unknown>;
}

function str(o: Record<string, unknown>, field: string): string {
  const v = o[field];
  if (typeof v !== 'string' || v.length === 0) invalid(`\`${field}\` must be a non-empty string.`);
  return v;
}

/** A decimal as the ledger wants it: a number in a string, and a finite one. */
function decimal(o: Record<string, unknown>, field: string): string {
  const v = o[field];
  const text = typeof v === 'number' ? String(v) : v;
  if (typeof text !== 'string' || !/^-?\d+(\.\d+)?$/.test(text)) {
    invalid(`\`${field}\` must be a decimal number.`);
  }
  return text;
}

/** An ISO instant, or explicit null. `undefined` is not null — say which you mean. */
function instantOrNull(o: Record<string, unknown>, field: string): string | null {
  const v = o[field];
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string' || Number.isNaN(Date.parse(v))) {
    invalid(`\`${field}\` must be an ISO-8601 timestamp or null.`);
  }
  return v;
}

function partyOrNull(o: Record<string, unknown>, field: string): string | null {
  const v = o[field];
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string' || v.length === 0) invalid(`\`${field}\` must be a party id or null.`);
  return v;
}

function parties(o: Record<string, unknown>, field: string): string[] {
  const v = o[field];
  if (!Array.isArray(v) || v.some((p) => typeof p !== 'string' || p.length === 0)) {
    invalid(`\`${field}\` must be an array of party ids.`);
  }
  return v as string[];
}

/** A read request: acting party, and optionally which templates and whether events. */
export function parseQueryRequest(body: unknown): QueryRequest {
  const o = object(body);
  const asParty = str(o, 'asParty');

  let templates: LedgerTemplate[] | undefined;
  if (o.templates !== undefined && o.templates !== null) {
    if (!Array.isArray(o.templates)) invalid('`templates` must be an array.');
    const named: LedgerTemplate[] = [];
    for (const t of o.templates) {
      if (!isTemplate(t)) {
        invalid(`\`templates\` contains an unknown template: ${JSON.stringify(t)}.`);
      }
      named.push(t);
    }
    templates = named;
  }

  if (o.events !== undefined && typeof o.events !== 'boolean') {
    invalid('`events` must be a boolean.');
  }

  return { asParty, templates, events: o.events as boolean | undefined };
}

/**
 * A write request. The `kind` is checked against the known set FIRST, so an
 * unknown one is a 400 naming it rather than a 200 with nothing in it.
 */
export function parseCommandRequest(body: unknown): CommandRequest {
  const o = object(body);
  if (!isKind(o.kind)) {
    invalid(
      `Unknown command \`kind\`: ${JSON.stringify(o.kind)}. Expected one of ${Object.keys(KINDS).join(', ')}.`,
    );
  }
  const kind = o.kind;
  const asParty = str(o, 'asParty');

  switch (kind) {
    case 'createRfq': {
      if (!isSide(o.side)) invalid('`side` must be "Buy" or "Sell".');
      const side = o.side;
      const invitedDealers = parties(o, 'invitedDealers');
      if (invitedDealers.length === 0) invalid('Invite at least one dealer.');
      if (new Set(invitedDealers).size !== invitedDealers.length) {
        invalid('`invitedDealers` contains the same party twice.');
      }
      if (invitedDealers.includes(asParty)) {
        invalid('The treasury cannot invite itself as a dealer.');
      }
      return {
        kind: 'createRfq',
        asParty,
        asset: str(o, 'asset'),
        quoteCurrency: str(o, 'quoteCurrency'),
        side,
        quantity: decimal(o, 'quantity'),
        quoteDeadline: instantOrNull(o, 'quoteDeadline'),
        invitedDealers,
      };
    }

    case 'closeRfq':
    case 'cancelRfq':
      return { kind, asParty, rfqContractId: str(o, 'rfqContractId') };

    case 'acceptQuote':
      return {
        kind,
        asParty,
        quoteContractId: str(o, 'quoteContractId'),
        rfqContractId: str(o, 'rfqContractId'),
      };

    case 'submitQuote':
      return {
        kind,
        asParty,
        invitationContractId: str(o, 'invitationContractId'),
        price: decimal(o, 'price'),
        expiry: instantOrNull(o, 'expiry'),
      };

    case 'reviseQuote':
      return {
        kind,
        asParty,
        quoteContractId: str(o, 'quoteContractId'),
        newPrice: decimal(o, 'newPrice'),
      };

    case 'withdrawQuote':
      return { kind, asParty, quoteContractId: str(o, 'quoteContractId') };

    case 'declineInvitation':
      return { kind, asParty, invitationContractId: str(o, 'invitationContractId') };

    case 'allocateAsset':
      return {
        kind,
        asParty,
        tradeContractId: str(o, 'tradeContractId'),
        assetHoldingCid: str(o, 'assetHoldingCid'),
        auditor: partyOrNull(o, 'auditor'),
      };

    case 'settle':
      return {
        kind,
        asParty,
        instructionContractId: str(o, 'instructionContractId'),
        paymentHoldingCid: str(o, 'paymentHoldingCid'),
      };
  }
}
