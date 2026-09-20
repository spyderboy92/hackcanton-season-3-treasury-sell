/**
 * `LedgerClient` backed by a live Canton participant.
 *
 * This object runs in the browser and never touches the participant: every
 * method is one call to this app's own route handlers, which act as the
 * selected party against the JSON Ledger API. Three consequences worth stating
 * plainly, because they are the whole reason the interface exists:
 *
 *  1. Reads are party-scoped by the LEDGER. `listQuotes(dealerA)` returns one
 *     quote because the participant only has one to give that party — not
 *     because anything here filtered the other two out. The only client-side
 *     narrowing in this file is by `rfqId` and by holding owner, neither of
 *     which is a confidentiality boundary (see the comments at each site).
 *  2. Decimals are strings from the input box to the ledger and back. Nothing
 *     here calls `parseFloat` on money.
 *  3. `acceptQuote` submits two sibling commands in one submission. The array
 *     that makes that true is in `lib/ledger/server/ledger.ts`.
 */

import {
  LedgerError,
  type AcceptQuoteCommand,
  type AcceptQuoteResult,
  type AllocateAssetCommand,
  type CreateRfqCommand,
  type DeskSnapshot,
  type HoldingFilter,
  type LedgerClient,
  type LedgerTemplate,
  type ReviseQuoteCommand,
  type RfqFilter,
  type SettleCommand,
  type SubmitQuoteCommand,
  type Unsubscribe,
} from './client';
import { apiBaseUrl, ledgerEndpointLabel, pollIntervalMs } from './config';
import type {
  CommandRequest,
  CommandResponse,
  QueryRequest,
  QueryResponse,
  TipResponse,
  WireContract,
  WireError,
} from './wire';
import type {
  AcceptedTrade,
  Contract,
  ContractId,
  Party,
  Quote,
  Rfq,
  RfqInvitation,
  SettlementInstruction,
  SettlementReceipt,
  TokenHolding,
} from './types';

export class CantonLedgerClient implements LedgerClient {
  readonly kind = 'canton' as const;
  readonly endpoint = ledgerEndpointLabel();

  private readonly listeners = new Set<() => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  /** Last ledger end this client announced. -1 until the first observation. */
  private offset = -1;

  /* ── reads ──────────────────────────────────────────────────────────── */

  async snapshot(asParty: Party): Promise<DeskSnapshot> {
    // One round trip for the whole desk: the participant computes this party's
    // ACS across every template in the workflow, plus its slice of the
    // transaction stream.
    const response = await this.query({ asParty, events: true });
    this.advance(response.offset);
    return {
      asParty,
      at: response.at,
      rfqs: pick<Rfq>(response.contracts, 'RFQ'),
      invitations: pick<RfqInvitation>(response.contracts, 'RfqInvitation'),
      quotes: pick<Quote>(response.contracts, 'Quote'),
      trades: pick<AcceptedTrade>(response.contracts, 'AcceptedTrade'),
      instructions: pick<SettlementInstruction>(response.contracts, 'SettlementInstruction'),
      receipts: pick<SettlementReceipt>(response.contracts, 'SettlementReceipt'),
      holdings: pick<TokenHolding>(response.contracts, 'TokenHolding').filter(
        (h) => h.payload.owner === asParty,
      ),
      events: response.events,
    };
  }

  async listRfqs(asParty: Party, filter?: RfqFilter) {
    return byRfq(await this.list<Rfq>(asParty, 'RFQ'), filter);
  }

  async getRfq(asParty: Party, rfqId: string) {
    const [found] = await this.listRfqs(asParty, { rfqId });
    return found ?? null;
  }

  async listInvitations(asParty: Party, filter?: RfqFilter) {
    return byRfq(await this.list<RfqInvitation>(asParty, 'RfqInvitation'), filter);
  }

  async listQuotes(asParty: Party, filter?: RfqFilter) {
    return byRfq(await this.list<Quote>(asParty, 'Quote'), filter);
  }

  async listTrades(asParty: Party, filter?: RfqFilter) {
    return byRfq(await this.list<AcceptedTrade>(asParty, 'AcceptedTrade'), filter);
  }

  async listInstructions(asParty: Party, filter?: RfqFilter) {
    return byRfq(await this.list<SettlementInstruction>(asParty, 'SettlementInstruction'), filter);
  }

  async listReceipts(asParty: Party, filter?: RfqFilter) {
    return byRfq(await this.list<SettlementReceipt>(asParty, 'SettlementReceipt'), filter);
  }

  async listHoldings(asParty: Party, filter?: HoldingFilter) {
    // The participant already decided which holdings this party may see (it is
    // an observer on its own, and the registry is a signatory on all of them).
    // Restricting to `owner === asParty` is a "my positions" view, not a
    // confidentiality filter: a registry desk would legitimately see more.
    const rows = (await this.list<TokenHolding>(asParty, 'TokenHolding')).filter(
      (r) => r.payload.owner === asParty,
    );
    return filter?.symbol ? rows.filter((r) => r.payload.symbol === filter.symbol) : rows;
  }

  /* ── treasury commands ──────────────────────────────────────────────── */

  async createRfq(asParty: Party, command: CreateRfqCommand): Promise<Contract<Rfq>> {
    const response = await this.command({ kind: 'createRfq', asParty, ...command });
    return required(response.rfq, 'RFQ');
  }

  async closeRfq(asParty: Party, rfqContractId: ContractId) {
    const response = await this.command({ kind: 'closeRfq', asParty, rfqContractId });
    return required(response.rfq, 'RFQ');
  }

  async cancelRfq(asParty: Party, rfqContractId: ContractId) {
    const response = await this.command({ kind: 'cancelRfq', asParty, rfqContractId });
    return required(response.rfq, 'RFQ');
  }

  /**
   * Accept the winning quote and close the auction — two sibling commands in
   * ONE submission, never nested. Everything the losing dealers must not learn
   * rides on that distinction; see the comment in
   * `lib/ledger/server/ledger.ts` where the two commands are put in one array.
   */
  async acceptQuote(asParty: Party, command: AcceptQuoteCommand): Promise<AcceptQuoteResult> {
    const response = await this.command({ kind: 'acceptQuote', asParty, ...command });
    return {
      trade: required(response.trade, 'AcceptedTrade'),
      rfq: required(response.rfq, 'RFQ'),
    };
  }

  /* ── dealer commands ────────────────────────────────────────────────── */

  async submitQuote(asParty: Party, command: SubmitQuoteCommand) {
    const response = await this.command({ kind: 'submitQuote', asParty, ...command });
    return required(response.quote, 'Quote');
  }

  async reviseQuote(asParty: Party, command: ReviseQuoteCommand) {
    const response = await this.command({ kind: 'reviseQuote', asParty, ...command });
    return required(response.quote, 'Quote');
  }

  async withdrawQuote(asParty: Party, quoteContractId: ContractId) {
    const response = await this.command({ kind: 'withdrawQuote', asParty, quoteContractId });
    return required(response.invitation, 'RfqInvitation');
  }

  async declineInvitation(asParty: Party, invitationContractId: ContractId): Promise<void> {
    await this.command({ kind: 'declineInvitation', asParty, invitationContractId });
  }

  /* ── settlement ─────────────────────────────────────────────────────── */

  async allocateAsset(asParty: Party, command: AllocateAssetCommand) {
    const response = await this.command({ kind: 'allocateAsset', asParty, ...command });
    return required(response.instruction, 'SettlementInstruction');
  }

  async settle(asParty: Party, command: SettleCommand) {
    const response = await this.command({ kind: 'settle', asParty, ...command });
    return required(response.receipt, 'SettlementReceipt');
  }

  /* ── change notification ────────────────────────────────────────────── */

  /**
   * The JSON Ledger API exposes the update stream over websockets, which a
   * route handler cannot hold open on this app's runtime. So the browser polls
   * the participant's ledger END — a single integer — and re-reads only when it
   * moves. One interval is shared by every listener, it stops when the last
   * listener leaves and while the tab is hidden, and a command advances the
   * offset itself so the desk that issued it does not wait for the next tick.
   */
  subscribe(listener: () => void): Unsubscribe {
    this.listeners.add(listener);
    this.start();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.stop();
    };
  }

  private start(): void {
    if (this.timer !== null || typeof window === 'undefined') return;
    this.timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      void this.poll();
    }, pollIntervalMs());
  }

  private stop(): void {
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  private async poll(): Promise<void> {
    try {
      const tip = await this.get<TipResponse>('/api/ledger/tip');
      this.advance(tip.offset);
    } catch {
      // A participant that blinks should not tear the desk down; the next tick
      // picks it back up and the read paths surface the error properly.
    }
  }

  /** Announce a new ledger end exactly once. */
  private advance(offset: number): void {
    if (offset === this.offset) return;
    const first = this.offset === -1;
    this.offset = offset;
    if (!first) this.emit();
  }

  private emit(): void {
    for (const listener of [...this.listeners]) listener();
  }

  /* ── transport ──────────────────────────────────────────────────────── */

  private async list<T>(asParty: Party, template: LedgerTemplate): Promise<Contract<T>[]> {
    const response = await this.query({ asParty, templates: [template] });
    this.advance(response.offset);
    return pick<T>(response.contracts, template);
  }

  private query(request: QueryRequest): Promise<QueryResponse> {
    return this.post<QueryResponse>('/api/ledger/query', request);
  }

  private async command(request: CommandRequest): Promise<CommandResponse> {
    const response = await this.post<CommandResponse>('/api/ledger/command', request);
    // The transaction has committed; tell every desk in this tab to re-read
    // rather than waiting up to one poll interval.
    this.advance(response.offset);
    return response;
  }

  private get<T>(path: string): Promise<T> {
    return this.send<T>(path, { method: 'GET' });
  }

  private post<T>(path: string, body: unknown): Promise<T> {
    return this.send<T>(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  private async send<T>(path: string, init: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${apiBaseUrl()}${path}`, { ...init, cache: 'no-store' });
    } catch {
      throw new LedgerError('UNAVAILABLE', `No answer from the ledger service at ${this.endpoint}.`);
    }

    const text = await response.text();
    if (!response.ok) {
      const wire = parse<WireError>(text);
      if (wire?.error) throw new LedgerError(wire.error.code, wire.error.message);
      throw new LedgerError('UNAVAILABLE', text.trim() || `Ledger call failed (HTTP ${response.status}).`);
    }

    const parsed = parse<T>(text);
    if (parsed === null) throw new LedgerError('UNAVAILABLE', 'The ledger service returned no answer.');
    return parsed;
  }
}

function parse<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function pick<T>(contracts: WireContract[], template: LedgerTemplate): Contract<T>[] {
  return contracts
    .filter((c) => c.template === template)
    .map((c) => ({ contractId: c.contractId, payload: c.payload as T }));
}

/**
 * Narrowing to one RFQ. The ACS filter works on templates, not on payload
 * fields, so this selection happens here — it picks one auction out of the
 * ones this party can already see, and can never widen that set.
 */
function byRfq<T extends { rfqId: string }>(
  rows: Contract<T>[],
  filter?: RfqFilter,
): Contract<T>[] {
  return filter?.rfqId ? rows.filter((r) => r.payload.rfqId === filter.rfqId) : rows;
}

function required<T>(value: Contract<T> | undefined, template: LedgerTemplate): Contract<T> {
  if (!value) {
    throw new LedgerError(
      'PRECONDITION_FAILED',
      `The ledger committed the command but disclosed no ${template} to this party.`,
    );
  }
  return value;
}
