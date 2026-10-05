/**
 * Canton JSON Ledger API (v2) adapter. SERVER ONLY.
 *
 * Nothing in `components/` or any browser bundle may import this module: the
 * browser reaches the participant exclusively through the route handlers in
 * `app/api/ledger/*`, which act as the selected party. Keeping the single
 * network hop here is what lets the participant, rather than TypeScript, decide
 * what each party may see.
 *
 * Shapes come from the participant's own OpenAPI document
 * (`GET /docs/openapi` on the JSON API port), not from guesswork.
 */

import { authorizationHeaders } from './auth';
import { ledgerConnection } from './config';
import { LedgerError, type LedgerErrorCode, type LedgerTemplate } from '../client';
import type { Party } from '../types';

/* ── template identifiers ─────────────────────────────────────────────── */

/**
 * Package-NAME references (`#treasury-rfq:...`). A package-id reference would
 * pin the UI to one build of the DAR and break on every recompile; the
 * package-name form resolves to whatever build the participant has vetted.
 */
const PACKAGE = '#treasury-rfq';

/**
 * Templates the participant knows about. `RfqFill` is deliberately NOT part of
 * the UI's `LedgerTemplate` union: it is the treasury's single-use right to
 * fill one RFQ, its only stakeholder is the treasury, and no desk renders it.
 * It exists here because commands must address it.
 */
export type WireTemplate = LedgerTemplate | 'RfqFill';

const MODULE: Record<WireTemplate, string> = {
  RFQ: 'TreasuryRfq.Rfq',
  RfqFill: 'TreasuryRfq.Rfq',
  RfqInvitation: 'TreasuryRfq.Quoting',
  Quote: 'TreasuryRfq.Quoting',
  AcceptedTrade: 'TreasuryRfq.Settlement',
  SettlementInstruction: 'TreasuryRfq.Settlement',
  SettlementReceipt: 'TreasuryRfq.Settlement',
  TokenHolding: 'TreasuryRfq.Holding',
};

/** Every template a desk reads. `RfqFill` is not one of them — nothing renders it. */
export const ALL_TEMPLATES = (Object.keys(MODULE) as WireTemplate[]).filter(
  (t): t is LedgerTemplate => t !== 'RfqFill',
);

export function templateId(template: WireTemplate): string {
  return `${PACKAGE}:${MODULE[template]}:${template}`;
}

/** `<pkg-id>:TreasuryRfq.Quoting:Quote` -> `Quote`. */
export function entityOf(qualified: string): string {
  return qualified.slice(qualified.lastIndexOf(':') + 1);
}

/**
 * `<pkg-id>:TreasuryRfq.Quoting:Quote` -> `Quote`, or null when the UI has no
 * type for it (an `RfqFill`, or a template from another package entirely).
 */
export function templateOf(qualified: string): LedgerTemplate | null {
  const entity = entityOf(qualified);
  return entity !== 'RfqFill' && entity in MODULE ? (entity as LedgerTemplate) : null;
}

/* ── wire shapes (only the fields this app reads) ─────────────────────── */

export interface CreatedEvent {
  offset: number;
  nodeId: number;
  contractId: string;
  templateId: string;
  createArgument: Record<string, unknown>;
  createdEventBlob?: string;
  witnessParties: Party[];
  signatories: Party[];
  observers: Party[];
  createdAt: string;
}

export interface ArchivedEvent {
  offset: number;
  nodeId: number;
  contractId: string;
  templateId: string;
  witnessParties: Party[];
}

export interface Transaction {
  updateId: string;
  effectiveAt: string;
  offset: number;
  events: ({ CreatedEvent?: CreatedEvent } & { ArchivedEvent?: ArchivedEvent })[];
}

export interface PartyDetails {
  party: Party;
  isLocal: boolean;
}

/* ── transport ────────────────────────────────────────────────────────── */

interface CantonError {
  code?: string;
  cause?: string;
  grpcCodeValue?: number;
  errorCategory?: number;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const connection = ledgerConnection();
  const url = `${connection.baseUrl}${path}`;
  const authHeaders = await authorizationHeaders(connection);
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      // Ledger reads are never cached: the whole point is a live ACS.
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}), ...authHeaders },
    });
  } catch (cause) {
    // Next signals "this route cannot be static" by throwing out of fetch.
    // That is control flow, not a ledger failure, and must not be swallowed.
    if (isFrameworkBailout(cause)) throw cause;
    throw new LedgerError(
      'UNAVAILABLE',
      'The participant did not answer.',
    );
  }

  const body = await response.text();
  if (response.status === 401 || response.status === 403) {
    throw new LedgerError('NOT_AUTHORIZED', 'Participant rejected the credentials or party permissions.');
  }
  if (!response.ok) throw mapError(response.status, body);
  if (!body) return undefined as T;
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new LedgerError('UNAVAILABLE', `The participant returned a malformed response for ${path}.`);
  }
}

function isFrameworkBailout(cause: unknown): boolean {
  return typeof (cause as { digest?: unknown } | null)?.digest === 'string';
}

/**
 * Ledger rejections, rendered as something a trading desk would accept on a
 * screen. A raw `UNHANDLED_EXCEPTION(9,abc): Unhandled Daml exception: ...`
 * blob makes an intentional authorization failure look like a crash, and the
 * demo turns on failures looking deliberate.
 */
export function mapError(status: number, body: string): LedgerError {
  let error: CantonError = {};
  try {
    error = JSON.parse(body) as CantonError;
  } catch {
    return new LedgerError(status === 404 ? 'NOT_FOUND' : 'UNAVAILABLE', body.trim() || `HTTP ${status}`);
  }
  return new LedgerError(codeFor(error), messageFor(error));
}

function codeFor(error: CantonError): LedgerErrorCode {
  const code = error.code ?? '';
  const cause = error.cause ?? '';

  if (/CONTRACT_NOT_ACTIVE|INACTIVE_CONTRACTS|Contract could not be found with id|LOCAL_VERDICT_LOCKED_CONTRACTS/i.test(code + cause)) {
    return 'CONTRACT_NOT_ACTIVE';
  }
  if (/DAML_AUTHORIZATION_ERROR|requires authorizers|missing authorization|PERMISSION_DENIED/i.test(code + cause)) {
    return 'NOT_AUTHORIZED';
  }
  // NOT an authorization failure, despite reading like one. The participant could not
  // route the submission to a synchronizer — a connectivity or topology fault, nothing
  // to do with who the submitter is. Grouped with the authorization errors it sent
  // operators to check permissions while the participant's synchronizer connection was
  // the actual fault, so it gets the unavailability code it deserves.
  if (/NO_SYNCHRONIZER_FOR_SUBMISSION|SYNCHRONIZER_NOT_CONNECTED|NOT_CONNECTED_TO_ANY_SYNCHRONIZER/i.test(code + cause)) {
    return 'UNAVAILABLE';
  }
  if (/CONTRACT_NOT_FOUND|TEMPLATE_NOT_FOUND|PARTY_NOT_KNOWN|NOT_FOUND/i.test(code)) return 'NOT_FOUND';
  if (/UNHANDLED_EXCEPTION|DAML_FAILURE|INTERPRETATION_.*FAILED|PRECONDITION|ABORTED|FAILED_PRECONDITION/i.test(code)) {
    return 'PRECONDITION_FAILED';
  }
  if (/UNAVAILABLE|DEADLINE|SERVICE_NOT_RUNNING|REQUEST_TIME_OUT/i.test(code)) return 'UNAVAILABLE';

  switch (error.grpcCodeValue) {
    case 3:
      return 'INVALID_ARGUMENT';
    case 5:
      return 'NOT_FOUND';
    case 7:
      return 'NOT_AUTHORIZED';
    case 9:
    case 10:
      return 'PRECONDITION_FAILED';
    case 14:
      return 'UNAVAILABLE';
    default:
      return 'INVALID_ARGUMENT';
  }
}

function messageFor(error: CantonError): string {
  const cause = error.cause ?? error.code ?? 'The ledger rejected the command.';

  // A Daml `assertMsg` surfaces as an AssertionFailed exception carrying the
  // author's own wording. Canton wraps it in an interpretation-error preamble
  // ("Interpretation error: Error: User failure: UNHANDLED_EXCEPTION/
  // DA.Exception.AssertionFailed:AssertionFailed (error category 9): <text>").
  // The author's sentence is the only part a trading desk can act on.
  const wrapped = /\(error category \d+\):\s*([\s\S]+)$/.exec(cause);
  if (wrapped?.[1]) return tidy(wrapped[1]);
  const payload = /message\s*=\s*"((?:[^"\\]|\\.)*)"/.exec(cause);
  if (payload?.[1]) return unescapeDaml(payload[1]);

  // The participant cannot tell "archived" from "you are not a stakeholder"
  // apart in its answer, and neither should this message pretend to.
  if (/Contract could not be found with id|CONTRACT_NOT_FOUND/i.test(cause)) {
    return 'That contract is not available to this party — it has been archived, or this party is not a stakeholder on it.';
  }

  // Template `ensure` clauses.
  if (/precondition/i.test(cause)) {
    const template = /Template precondition violated: #?(\w+)?/.exec(cause);
    return template?.[1]
      ? `The ledger refused the ${template[1]}: its precondition does not hold for those terms.`
      : 'The ledger refused the contract: a template precondition does not hold.';
  }

  if (/requires authorizers|missing authorization/i.test(cause)) {
    return 'That party is not authorised to exercise this choice.';
  }

  return tidy(cause);
}

/** First line, with Canton's own scaffolding taken off the front. */
function tidy(text: string): string {
  const stripped = text
    .replace(/^[A-Z_]+\(\d+,[0-9a-f]+\):\s*/, '')
    .replace(/^Interpretation error: Error: (User failure: )?/, '')
    .trim();
  return stripped.split('\n')[0]?.trim() || text.trim();
}

function unescapeDaml(text: string): string {
  return text.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
}

/* ── reads ────────────────────────────────────────────────────────────── */

export async function ledgerEnd(): Promise<number> {
  const { offset } = await call<{ offset: number }>('/v2/state/ledger-end');
  return offset;
}

export async function listParties(): Promise<PartyDetails[]> {
  const page = await call<{ partyDetails: PartyDetails[]; nextPageToken?: string }>('/v2/parties');
  return page.partyDetails ?? [];
}

function filtersFor(asParty: Party, templates: WireTemplate[], includeCreatedEventBlob = false) {
  return {
    filtersByParty: {
      // The ONLY party in the filter is the acting party, so the participant
      // itself decides what comes back. There is no second, wider read that
      // gets narrowed down afterwards.
      [asParty]: {
        cumulative: templates.map((t) => ({
          identifierFilter: { TemplateFilter: { value: { templateId: templateId(t), includeCreatedEventBlob } } },
        })),
      },
    },
    verbose: true,
  };
}

export interface ActiveContract {
  createdEvent: CreatedEvent;
  synchronizerId: string;
}

/** The acting party's active contract set, as the participant computes it. */
export async function activeContractEntries(
  asParty: Party,
  templates: WireTemplate[],
  activeAtOffset: number,
  includeCreatedEventBlob = false,
): Promise<ActiveContract[]> {
  if (activeAtOffset === 0) return [];
  const rows = await call<{ contractEntry?: { JsActiveContract?: ActiveContract } }[]>(
    '/v2/state/active-contracts',
    {
      method: 'POST',
      body: JSON.stringify({
        activeAtOffset,
        eventFormat: filtersFor(asParty, templates, includeCreatedEventBlob),
      }),
    },
  );
  return rows.flatMap((r) => {
    const entry = r.contractEntry?.JsActiveContract;
    return entry ? [entry] : [];
  });
}

export async function activeContracts(
  asParty: Party,
  templates: WireTemplate[],
  activeAtOffset: number,
): Promise<CreatedEvent[]> {
  return (await activeContractEntries(asParty, templates, activeAtOffset)).map((e) => e.createdEvent);
}

/**
 * The acting party's slice of the transaction stream, newest first. This is the
 * participant's own disclosure record — what is missing from it is the point.
 */
export async function transactions(
  asParty: Party,
  endInclusive: number,
  limit = 100,
): Promise<Transaction[]> {
  if (endInclusive === 0) return [];
  const rows = await call<{ update?: { Transaction?: { value: Transaction } } }[]>(
    `/v2/updates/flats?limit=${limit}`,
    {
      method: 'POST',
      body: JSON.stringify({
        beginExclusive: 0,
        endInclusive,
        descendingOrder: true,
        updateFormat: {
          includeTransactions: {
            transactionShape: 'TRANSACTION_SHAPE_ACS_DELTA',
            eventFormat: filtersFor(asParty, ALL_TEMPLATES),
          },
        },
      }),
    },
  );
  return rows.flatMap((r) => (r.update?.Transaction ? [r.update.Transaction.value] : []));
}

/* ── writes ───────────────────────────────────────────────────────────── */

export interface ExerciseCommand {
  ExerciseCommand: {
    templateId: string;
    contractId: string;
    choice: string;
    choiceArgument: Record<string, unknown>;
  };
}

export interface CreateCommand {
  CreateCommand: { templateId: string; createArguments: Record<string, unknown> };
}

/**
 * A contract handed to the participant with the submission because the
 * submitting party cannot see it in its own ACS. Canton has no divulgence, so
 * this is the supported way for a counterparty's contract to take part in a
 * transaction.
 */
export interface DisclosedContract {
  templateId: string;
  contractId: string;
  createdEventBlob: string;
  synchronizerId: string;
}

export type LedgerCommand = ExerciseCommand | CreateCommand;

export function exercise(
  template: WireTemplate,
  contractId: string,
  choice: string,
  choiceArgument: Record<string, unknown> = {},
): ExerciseCommand {
  return { ExerciseCommand: { templateId: templateId(template), contractId, choice, choiceArgument } };
}

export function create(
  template: WireTemplate,
  createArguments: Record<string, unknown>,
): CreateCommand {
  return { CreateCommand: { templateId: templateId(template), createArguments } };
}

/**
 * One submission, one atomic transaction. `commands` is a LIST on purpose:
 * two sibling commands submitted together commit atomically while staying
 * separate root nodes, which is not the same thing as nesting one inside the
 * other (see `acceptQuote` in ./ledger.ts).
 */
export async function submit(
  asParty: Party,
  commands: LedgerCommand[],
  disclosedContracts: DisclosedContract[] = [],
): Promise<Transaction> {
  const response = await call<{ transaction: Transaction }>(
    '/v2/commands/submit-and-wait-for-transaction',
    {
      method: 'POST',
      body: JSON.stringify({
        commands: {
          commandId: commandId(),
          userId: ledgerConnection().userId,
          actAs: [asParty],
          commands,
          disclosedContracts,
        },
        // Read the result back as the submitting party, so the response the UI
        // gets is exactly what that party is entitled to see.
        transactionFormat: {
          transactionShape: 'TRANSACTION_SHAPE_ACS_DELTA',
          eventFormat: filtersFor(asParty, ALL_TEMPLATES),
        },
      }),
    },
  );
  return response.transaction;
}

function commandId(): string {
  return `ui-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * The disclosure payload for one contract, read as a party that CAN see it.
 *
 * This is the wire form of "the seller hands the buyer its allocated holding":
 * the blob travels with the buyer's submission so the engine can resolve a
 * contract the buyer is not a stakeholder on.
 */
export async function disclosureFor(
  asParty: Party,
  template: WireTemplate,
  contractId: string,
  activeAtOffset: number,
): Promise<DisclosedContract> {
  const entries = await activeContractEntries(asParty, [template], activeAtOffset, true);
  const found = entries.find((e) => e.createdEvent.contractId === contractId);
  if (!found || !found.createdEvent.createdEventBlob) {
    throw new LedgerError(
      'NOT_FOUND',
      `The allocated ${template} is no longer available for disclosure; it must be allocated again.`,
    );
  }
  return {
    templateId: found.createdEvent.templateId,
    contractId: found.createdEvent.contractId,
    createdEventBlob: found.createdEvent.createdEventBlob,
    synchronizerId: found.synchronizerId,
  };
}

/** Every contract this party saw created by the transaction, in node order. */
export function createdIn(transaction: Transaction, template: LedgerTemplate): CreatedEvent[] {
  return transaction.events
    .flatMap((e) => (e.CreatedEvent ? [e.CreatedEvent] : []))
    .filter((e) => templateOf(e.templateId) === template);
}

export function archivedIn(transaction: Transaction): ArchivedEvent[] {
  return transaction.events.flatMap((e) => (e.ArchivedEvent ? [e.ArchivedEvent] : []));
}

/** The one contract of that template the command was expected to produce. */
export function requireCreated(
  transaction: Transaction,
  template: LedgerTemplate,
): CreatedEvent {
  const [first] = createdIn(transaction, template);
  if (!first) {
    throw new LedgerError(
      'PRECONDITION_FAILED',
      `The transaction committed but disclosed no ${template} to this party.`,
    );
  }
  return first;
}
