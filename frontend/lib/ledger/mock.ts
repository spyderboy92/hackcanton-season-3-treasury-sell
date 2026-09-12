/**
 * In-memory LedgerClient.
 *
 * This is not a UI-side filter dressed up as a ledger. Every read resolves the
 * stakeholders of each contract from its payload — exactly the signatory /
 * observer sets declared in the Daml templates — and returns only rows the
 * acting party is a stakeholder on. `listQuotes` therefore returns three quotes
 * to the treasury and exactly one to a dealer, for the same reason the real
 * ledger will: nobody else is on the contract.
 *
 * Fixture numbers are BUILD-SPEC section 4.
 */

import { multiply } from '../decimal';
import {
  LedgerError,
  type AcceptQuoteCommand,
  type AcceptQuoteResult,
  type AllocateAssetCommand,
  type CreateRfqCommand,
  type DeskSnapshot,
  type HoldingFilter,
  type LedgerClient,
  type LedgerEvent,
  type LedgerTemplate,
  type ReviseQuoteCommand,
  type RfqFilter,
  type SettleCommand,
  type SubmitQuoteCommand,
  type Unsubscribe,
} from './client';
import { AUDITOR, DEALER_A, DEALER_B, DEALER_C, REGISTRY, TREASURY } from './parties';
import {
  buyerOf,
  sellerOf,
  type AcceptedTrade,
  type Contract,
  type ContractId,
  type Instant,
  type Party,
  type Quote,
  type Rfq,
  type RfqInvitation,
  type SettlementInstruction,
  type SettlementReceipt,
  type TokenHolding,
} from './types';

/* ── store ────────────────────────────────────────────────────────────── */

/**
 * The treasury's single-use right to fill one RFQ.
 *
 * Signatory treasury, no observers — it is disclosed to nobody else, so it is
 * deliberately absent from `types.ts`, from the `LedgerTemplate` union and from
 * every read on this client. No screen can render it because no read returns
 * it. It exists so that a second Accept against the same RFQ is rejected by the
 * ledger rather than by a guard in the interface.
 */
interface RfqFill {
  rfqId: string;
  treasury: Party;
}

interface Row<T> {
  contractId: ContractId;
  payload: T;
  archived: boolean;
}

interface Store {
  rfqs: Row<Rfq>[];
  invitations: Row<RfqInvitation>[];
  quotes: Row<Quote>[];
  trades: Row<AcceptedTrade>[];
  instructions: Row<SettlementInstruction>[];
  receipts: Row<SettlementReceipt>[];
  holdings: Row<TokenHolding>[];
  /** Internal: never read back through the client surface. */
  fills: Row<RfqFill>[];
  events: LedgerEvent[];
}

/** Command round-trip delay, so pending states are real rather than theatre. */
const COMMAND_LATENCY_MS = 220;

/**
 * The fixture survives a page reload within the same tab, so a refresh mid-demo
 * does not rewind the trade. A new tab starts from the seeded position.
 */
const SESSION_KEY = 'rfq.mock.v2';

const emptyStore = (): Store => ({
  rfqs: [],
  invitations: [],
  quotes: [],
  trades: [],
  instructions: [],
  receipts: [],
  holdings: [],
  fills: [],
  events: [],
});

/* ── deterministic ids ────────────────────────────────────────────────── */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── stakeholder resolution (mirrors the Daml signatory/observer sets) ── */

const stakeholders = {
  rfq: (p: Rfq): Party[] => [p.treasury, ...p.invitedDealers],
  invitation: (p: RfqInvitation): Party[] => [p.treasury, p.dealer],
  quote: (p: Quote): Party[] => [p.treasury, p.dealer],
  trade: (p: AcceptedTrade): Party[] => [p.treasury, p.dealer],
  instruction: (p: SettlementInstruction): Party[] => [p.treasury, p.dealer],
  receipt: (p: SettlementReceipt): Party[] =>
    p.auditor ? [p.treasury, p.dealer, p.auditor] : [p.treasury, p.dealer],
  holding: (p: TokenHolding): Party[] => [p.issuer, p.owner],
  /** Signatory treasury, no observers. Not a dealer, not the auditor, nobody. */
  fill: (p: RfqFill): Party[] => [p.treasury],
};

function readable<T>(rows: Row<T>[], asParty: Party, witnesses: (p: T) => Party[]): Contract<T>[] {
  return rows
    .filter((r) => !r.archived && witnesses(r.payload).includes(asParty))
    .map((r) => ({ contractId: r.contractId, payload: r.payload }));
}

function byRfq<T extends { rfqId: string }>(rows: Contract<T>[], filter?: RfqFilter): Contract<T>[] {
  return filter?.rfqId ? rows.filter((r) => r.payload.rfqId === filter.rfqId) : rows;
}

/* ── implementation ───────────────────────────────────────────────────── */

export interface MockLedgerOptions {
  /** Seeded scenario. "quoted" is the demo opening position. */
  preset?: 'quoted' | 'open' | 'empty';
  /** Set to 0 in tests. */
  latencyMs?: number;
  /** Keep the fixture across reloads in this tab. Default true. */
  persist?: boolean;
}

export class MockLedgerClient implements LedgerClient {
  readonly kind = 'mock' as const;
  readonly endpoint = 'in-memory fixture';

  private store: Store = emptyStore();
  private listeners = new Set<() => void>();
  private counter = 0;
  private readonly preset: NonNullable<MockLedgerOptions['preset']>;
  private readonly latencyMs: number;
  private readonly persistent: boolean;

  constructor(options: MockLedgerOptions = {}) {
    this.preset = options.preset ?? 'quoted';
    this.latencyMs = options.latencyMs ?? COMMAND_LATENCY_MS;
    this.persistent = options.persist ?? true;
    if (!this.restore()) this.seed();
  }

  /* ── reads ──────────────────────────────────────────────────────────── */

  async snapshot(asParty: Party): Promise<DeskSnapshot> {
    return {
      asParty,
      at: now(),
      rfqs: await this.listRfqs(asParty),
      invitations: await this.listInvitations(asParty),
      quotes: await this.listQuotes(asParty),
      trades: await this.listTrades(asParty),
      instructions: await this.listInstructions(asParty),
      receipts: await this.listReceipts(asParty),
      holdings: await this.listHoldings(asParty),
      events: this.store.events.filter((e) => e.witnesses.includes(asParty)),
    };
  }

  async listRfqs(asParty: Party, filter?: RfqFilter) {
    return byRfq(readable(this.store.rfqs, asParty, stakeholders.rfq), filter);
  }

  async getRfq(asParty: Party, rfqId: string) {
    const [found] = await this.listRfqs(asParty, { rfqId });
    return found ?? null;
  }

  async listInvitations(asParty: Party, filter?: RfqFilter) {
    return byRfq(readable(this.store.invitations, asParty, stakeholders.invitation), filter);
  }

  async listQuotes(asParty: Party, filter?: RfqFilter) {
    return byRfq(readable(this.store.quotes, asParty, stakeholders.quote), filter);
  }

  async listTrades(asParty: Party, filter?: RfqFilter) {
    return byRfq(readable(this.store.trades, asParty, stakeholders.trade), filter);
  }

  async listInstructions(asParty: Party, filter?: RfqFilter) {
    return byRfq(readable(this.store.instructions, asParty, stakeholders.instruction), filter);
  }

  async listReceipts(asParty: Party, filter?: RfqFilter) {
    return byRfq(readable(this.store.receipts, asParty, stakeholders.receipt), filter);
  }

  async listHoldings(asParty: Party, filter?: HoldingFilter) {
    const rows = readable(this.store.holdings, asParty, stakeholders.holding).filter(
      (r) => r.payload.owner === asParty,
    );
    return filter?.symbol ? rows.filter((r) => r.payload.symbol === filter.symbol) : rows;
  }

  /* ── treasury commands ──────────────────────────────────────────────── */

  async createRfq(asParty: Party, command: CreateRfqCommand): Promise<Contract<Rfq>> {
    await this.wait();
    if (asParty !== TREASURY.party) {
      throw new LedgerError('NOT_AUTHORIZED', 'Only the treasury can raise an RFQ.');
    }
    if (command.invitedDealers.length === 0) {
      throw new LedgerError('INVALID_ARGUMENT', 'Invite at least one dealer.');
    }
    const rfqId = command.rfqId ?? this.uuid();
    const rfq: Rfq = {
      rfqId,
      treasury: asParty,
      asset: command.asset,
      quoteCurrency: command.quoteCurrency,
      side: command.side,
      quantity: command.quantity,
      quoteDeadline: command.quoteDeadline,
      invitedDealers: [...command.invitedDealers],
      status: 'Open',
    };
    const row = this.create(this.store.rfqs, rfq);
    this.log('RFQ', rfqId, stakeholders.rfq(rfq), `RFQ raised — ${command.side} ${command.quantity} ${command.asset}`);

    for (const dealer of command.invitedDealers) {
      const invitation: RfqInvitation = {
        rfqId,
        treasury: asParty,
        dealer,
        asset: command.asset,
        quoteCurrency: command.quoteCurrency,
        side: command.side,
        quantity: command.quantity,
        quoteDeadline: command.quoteDeadline,
      };
      this.create(this.store.invitations, invitation);
      this.log('RfqInvitation', rfqId, stakeholders.invitation(invitation), 'Invitation issued');
    }

    // Same submission as the RFQ and the invitations. Private to the treasury,
    // so it produces no event on anyone's transaction stream.
    this.create(this.store.fills, { rfqId, treasury: asParty });

    this.emit();
    return contract(row);
  }

  async closeRfq(asParty: Party, rfqContractId: ContractId) {
    await this.wait();
    const result = this.transitionRfq(asParty, rfqContractId, 'Closed');
    this.emit();
    return result;
  }

  async cancelRfq(asParty: Party, rfqContractId: ContractId) {
    await this.wait();
    const result = this.transitionRfq(asParty, rfqContractId, 'Cancelled');
    this.emit();
    return result;
  }

  async acceptQuote(asParty: Party, command: AcceptQuoteCommand): Promise<AcceptQuoteResult> {
    await this.wait();
    const quoteRow = this.active(this.store.quotes, command.quoteContractId, 'Quote');
    const quote = quoteRow.payload;
    if (asParty !== quote.treasury) {
      throw new LedgerError('NOT_AUTHORIZED', 'Only the treasury may accept a quote.');
    }
    if (quote.expiry && Date.parse(quote.expiry) <= Date.now()) {
      throw new LedgerError('PRECONDITION_FAILED', 'Quote has expired.');
    }

    // Accept takes the treasury's fill token and archives it. Resolved here
    // rather than passed in, exactly as the Canton client resolves it, so the
    // command signature stays the same for both backends. Checked before any
    // mutation so a rejected accept leaves the store untouched.
    const fillRow = this.fillFor(quote.rfqId, quote.treasury);
    if (!fillRow) {
      throw new LedgerError(
        'PRECONDITION_FAILED',
        'This RFQ has already been filled — its fill token was consumed by an earlier accept.',
      );
    }
    fillRow.archived = true;

    // Two sibling commands in one submission: Accept on the Quote, Close on the
    // RFQ. The losing dealers witness only the RFQ node.
    quoteRow.archived = true;
    const trade: AcceptedTrade = {
      rfqId: quote.rfqId,
      treasury: quote.treasury,
      dealer: quote.dealer,
      asset: quote.asset,
      quoteCurrency: quote.quoteCurrency,
      side: quote.side,
      quantity: quote.quantity,
      price: quote.price,
      acceptedAt: now(),
    };
    const tradeRow = this.create(this.store.trades, trade);
    this.log('AcceptedTrade', trade.rfqId, stakeholders.trade(trade), `Trade agreed at ${trade.price}`);

    const rfq = this.transitionRfq(asParty, command.rfqContractId, 'Closed');
    this.emit();
    return { trade: contract(tradeRow), rfq };
  }

  /* ── dealer commands ────────────────────────────────────────────────── */

  async submitQuote(asParty: Party, command: SubmitQuoteCommand): Promise<Contract<Quote>> {
    await this.wait();
    const row = this.active(this.store.invitations, command.invitationContractId, 'RfqInvitation');
    if (asParty !== row.payload.dealer) {
      throw new LedgerError('NOT_AUTHORIZED', 'Only the invited dealer may quote.');
    }
    row.archived = true;
    const quoteRow = this.createQuote(row.payload, command.price, command.expiry);
    this.log('Quote', quoteRow.payload.rfqId, stakeholders.quote(quoteRow.payload), `Quote submitted at ${command.price}`);
    this.emit();
    return contract(quoteRow);
  }

  async reviseQuote(asParty: Party, command: ReviseQuoteCommand): Promise<Contract<Quote>> {
    await this.wait();
    const row = this.active(this.store.quotes, command.quoteContractId, 'Quote');
    if (asParty !== row.payload.dealer) {
      throw new LedgerError('NOT_AUTHORIZED', 'Only the quoting dealer may revise.');
    }
    row.archived = true;
    const revised = this.create(this.store.quotes, {
      ...row.payload,
      price: command.newPrice,
      submittedAt: now(),
    });
    this.log('Quote', revised.payload.rfqId, stakeholders.quote(revised.payload), `Quote revised to ${command.newPrice}`);
    this.emit();
    return contract(revised);
  }

  async withdrawQuote(asParty: Party, quoteContractId: ContractId): Promise<Contract<RfqInvitation>> {
    await this.wait();
    const row = this.active(this.store.quotes, quoteContractId, 'Quote');
    if (asParty !== row.payload.dealer) {
      throw new LedgerError('NOT_AUTHORIZED', 'Only the quoting dealer may withdraw.');
    }
    row.archived = true;
    const q = row.payload;
    const invitation = this.create(this.store.invitations, {
      rfqId: q.rfqId,
      treasury: q.treasury,
      dealer: q.dealer,
      asset: q.asset,
      quoteCurrency: q.quoteCurrency,
      side: q.side,
      quantity: q.quantity,
      quoteDeadline: q.expiry,
    });
    this.log('Quote', q.rfqId, stakeholders.quote(q), 'Quote withdrawn');
    this.emit();
    return contract(invitation);
  }

  async declineInvitation(asParty: Party, invitationContractId: ContractId): Promise<void> {
    await this.wait();
    const row = this.active(this.store.invitations, invitationContractId, 'RfqInvitation');
    if (asParty !== row.payload.dealer) {
      throw new LedgerError('NOT_AUTHORIZED', 'Only the invited dealer may decline.');
    }
    row.archived = true;
    this.log('RfqInvitation', row.payload.rfqId, stakeholders.invitation(row.payload), 'Invitation declined');
    this.emit();
  }

  /* ── settlement ─────────────────────────────────────────────────────── */

  async allocateAsset(asParty: Party, command: AllocateAssetCommand) {
    await this.wait();
    const tradeRow = this.active(this.store.trades, command.tradeContractId, 'AcceptedTrade');
    const t = tradeRow.payload;
    const seller = sellerOf(t.side, t.treasury, t.dealer);
    if (asParty !== seller) {
      throw new LedgerError('NOT_AUTHORIZED', 'Only the seller may allocate the asset leg.');
    }
    const holding = this.active(this.store.holdings, command.assetHoldingCid, 'TokenHolding');
    if (holding.payload.owner !== seller || holding.payload.symbol !== t.asset) {
      throw new LedgerError('PRECONDITION_FAILED', 'Holding does not cover the asset leg.');
    }
    tradeRow.archived = true;
    const instruction: SettlementInstruction = {
      rfqId: t.rfqId,
      treasury: t.treasury,
      dealer: t.dealer,
      buyer: buyerOf(t.side, t.treasury, t.dealer),
      seller,
      asset: t.asset,
      assetQuantity: t.quantity,
      quoteCurrency: t.quoteCurrency,
      paymentAmount: multiply(t.quantity, t.price),
      price: t.price,
      assetHoldingCid: command.assetHoldingCid,
      auditor: command.auditor,
    };
    const row = this.create(this.store.instructions, instruction);
    this.log('SettlementInstruction', t.rfqId, stakeholders.instruction(instruction), 'Asset leg allocated');
    this.emit();
    return contract(row);
  }

  async settle(asParty: Party, command: SettleCommand) {
    await this.wait();
    const instrRow = this.active(this.store.instructions, command.instructionContractId, 'SettlementInstruction');
    const i = instrRow.payload;
    if (asParty !== i.buyer) {
      throw new LedgerError('NOT_AUTHORIZED', 'Only the buyer may allocate payment and settle.');
    }
    const payment = this.active(this.store.holdings, command.paymentHoldingCid, 'TokenHolding');
    if (payment.payload.owner !== i.buyer || payment.payload.symbol !== i.quoteCurrency) {
      throw new LedgerError('PRECONDITION_FAILED', 'Holding does not cover the payment leg.');
    }

    // Both legs move in one transaction. Atomic DvP.
    this.transfer(i.assetHoldingCid, i.buyer, i.assetQuantity);
    this.transfer(command.paymentHoldingCid, i.seller, i.paymentAmount);

    instrRow.archived = true;
    const receipt: SettlementReceipt = {
      rfqId: i.rfqId,
      treasury: i.treasury,
      dealer: i.dealer,
      buyer: i.buyer,
      seller: i.seller,
      asset: i.asset,
      assetQuantity: i.assetQuantity,
      quoteCurrency: i.quoteCurrency,
      paymentAmount: i.paymentAmount,
      price: i.price,
      auditor: i.auditor,
      settledAt: now(),
    };
    const row = this.create(this.store.receipts, receipt);
    this.log('SettlementReceipt', i.rfqId, stakeholders.receipt(receipt), 'Delivery versus payment settled');
    this.emit();
    return contract(row);
  }

  /* ── subscription + reset ───────────────────────────────────────────── */

  subscribe(listener: () => void): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async reset(): Promise<void> {
    this.store = emptyStore();
    this.counter = 0;
    this.seed();
    this.emit();
  }

  /* ── internals ──────────────────────────────────────────────────────── */

  private emit() {
    this.persist();
    for (const l of this.listeners) l();
  }

  private persist() {
    if (!this.persistent || typeof sessionStorage === 'undefined') return;
    try {
      sessionStorage.setItem(
        SESSION_KEY,
        JSON.stringify({ counter: this.counter, store: this.store }),
      );
    } catch {
      /* storage unavailable */
    }
  }

  private restore(): boolean {
    if (!this.persistent || typeof sessionStorage === 'undefined') return false;
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw) as { counter: number; store: Store };
      if (typeof parsed.counter !== 'number' || !parsed.store) return false;
      this.counter = parsed.counter;
      this.store = { ...emptyStore(), ...parsed.store };
      return this.store.rfqs.length > 0;
    } catch {
      return false;
    }
  }

  private wait(): Promise<void> {
    if (this.latencyMs <= 0) return Promise.resolve();
    return new Promise((resolve) => setTimeout(resolve, this.latencyMs));
  }

  /** Ids depend only on the command counter, so a restored store keeps minting
   *  fresh ones without carrying a PRNG through storage. */
  private hex(salt: number, length: number): string {
    this.counter += 1;
    const rand = mulberry32((salt ^ Math.imul(this.counter, 2654435761)) >>> 0);
    let out = '';
    for (let i = 0; i < length; i += 1) out += '0123456789abcdef'[Math.floor(rand() * 16)];
    return out;
  }

  private cid(): ContractId {
    return `00${this.hex(0x5eed, 62)}`;
  }

  private uuid(): string {
    const h = this.hex(0xbeef, 30);
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(12, 15)}-a${h.slice(15, 18)}-${h.slice(18, 30)}`;
  }

  private create<T>(rows: Row<T>[], payload: T): Row<T> {
    const row: Row<T> = { contractId: this.cid(), payload, archived: false };
    rows.push(row);
    return row;
  }

  private active<T>(rows: Row<T>[], contractId: ContractId, template: LedgerTemplate): Row<T> {
    const row = rows.find((r) => r.contractId === contractId);
    if (!row) throw new LedgerError('NOT_FOUND', `${template} ${contractId} not found.`);
    if (row.archived) throw new LedgerError('CONTRACT_NOT_ACTIVE', `${template} is no longer active.`);
    return row;
  }

  private createQuote(inv: RfqInvitation, price: string, expiry: Instant | null, at: Instant = now()) {
    return this.create(this.store.quotes, {
      rfqId: inv.rfqId,
      treasury: inv.treasury,
      dealer: inv.dealer,
      asset: inv.asset,
      quoteCurrency: inv.quoteCurrency,
      side: inv.side,
      quantity: inv.quantity,
      price,
      expiry,
      submittedAt: at,
    });
  }

  /** The treasury's unconsumed right to fill this RFQ, if it still holds one. */
  private fillFor(rfqId: string, treasury: Party): Row<RfqFill> | undefined {
    return this.store.fills.find(
      (r) =>
        !r.archived &&
        r.payload.rfqId === rfqId &&
        stakeholders.fill(r.payload).includes(treasury),
    );
  }

  private transitionRfq(asParty: Party, rfqContractId: ContractId, status: Rfq['status']) {
    const row = this.active(this.store.rfqs, rfqContractId, 'RFQ');
    if (asParty !== row.payload.treasury) {
      throw new LedgerError('NOT_AUTHORIZED', 'Only the treasury may change RFQ status.');
    }
    row.archived = true;
    const next = this.create(this.store.rfqs, { ...row.payload, status });
    this.log('RFQ', next.payload.rfqId, stakeholders.rfq(next.payload), `RFQ ${status.toLowerCase()}`);
    return contract(next);
  }

  /** Mirrors TokenHolding.Transfer: recipient holding plus optional change. */
  private transfer(holdingCid: ContractId, newOwner: Party, amount: string) {
    const row = this.active(this.store.holdings, holdingCid, 'TokenHolding');
    const h = row.payload;
    row.archived = true;
    this.create(this.store.holdings, { ...h, owner: newOwner, amount });
    const change = subtractAmount(h.amount, amount);
    if (change !== null) this.create(this.store.holdings, { ...h, amount: change });
  }

  private log(template: LedgerTemplate, rfqId: string | null, witnesses: Party[], summary: string) {
    this.store.events.unshift({
      id: `evt-${this.store.events.length + 1}-${this.counter}`,
      at: now(),
      template,
      summary,
      rfqId,
      witnesses,
    });
  }

  /* ── fixture (BUILD-SPEC section 4) ─────────────────────────────────── */

  private seed() {
    if (this.preset === 'empty') return;

    for (const h of [
      { owner: TREASURY.party, symbol: 'cETH', amount: '25.0000' },
      { owner: DEALER_A.party, symbol: 'USD', amount: '1000000.00' },
      { owner: DEALER_B.party, symbol: 'USD', amount: '1000000.00' },
      { owner: DEALER_C.party, symbol: 'USD', amount: '1000000.00' },
    ]) {
      this.create(this.store.holdings, { issuer: REGISTRY.party, ...h });
    }

    const rfqId = this.uuid();
    const opened = minutesAgo(14);
    const rfq: Rfq = {
      rfqId,
      treasury: TREASURY.party,
      asset: 'cETH',
      quoteCurrency: 'USD',
      side: 'Sell',
      quantity: '10.0000',
      quoteDeadline: minutesFromNow(11),
      invitedDealers: [DEALER_A.party, DEALER_B.party, DEALER_C.party],
      status: 'Open',
    };
    this.create(this.store.rfqs, rfq);
    this.store.events.unshift({
      id: 'evt-seed-rfq',
      at: opened,
      template: 'RFQ',
      summary: 'RFQ raised — Sell 10.0000 cETH against USD',
      rfqId,
      witnesses: stakeholders.rfq(rfq),
    });

    this.create(this.store.fills, { rfqId, treasury: TREASURY.party });

    const invitations = rfq.invitedDealers.map((dealer) =>
      this.create(this.store.invitations, {
        rfqId,
        treasury: TREASURY.party,
        dealer,
        asset: rfq.asset,
        quoteCurrency: rfq.quoteCurrency,
        side: rfq.side,
        quantity: rfq.quantity,
        quoteDeadline: rfq.quoteDeadline,
      }),
    );
    for (const inv of invitations) {
      this.store.events.unshift({
        id: `evt-seed-inv-${inv.contractId.slice(2, 8)}`,
        at: opened,
        template: 'RfqInvitation',
        summary: 'Invitation issued',
        rfqId,
        witnesses: stakeholders.invitation(inv.payload),
      });
    }

    if (this.preset === 'open') return;

    const prices: Array<[Party, string, number]> = [
      [DEALER_A.party, '3020.00', 9],
      [DEALER_C.party, '3010.00', 6],
      [DEALER_B.party, '3040.00', 3],
    ];
    for (const [dealer, price, ago] of prices) {
      const inv = invitations.find((i) => i.payload.dealer === dealer);
      if (!inv) continue;
      inv.archived = true;
      const at = minutesAgo(ago);
      const quote = this.createQuote(inv.payload, price, rfq.quoteDeadline, at);
      this.store.events.unshift({
        id: `evt-seed-q-${quote.contractId.slice(2, 8)}`,
        at,
        template: 'Quote',
        summary: `Quote submitted at ${price}`,
        rfqId,
        witnesses: stakeholders.quote(quote.payload),
      });
    }
    this.store.events.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  }
}

/* ── small helpers ────────────────────────────────────────────────────── */

function contract<T>(row: Row<T>): Contract<T> {
  return { contractId: row.contractId, payload: row.payload };
}

function now(): Instant {
  return new Date().toISOString();
}

function minutesAgo(m: number): Instant {
  return new Date(Date.now() - m * 60_000).toISOString();
}

function minutesFromNow(m: number): Instant {
  return new Date(Date.now() + m * 60_000).toISOString();
}

/** Returns the change amount, or null when the transfer consumed the holding. */
function subtractAmount(total: string, spent: string): string | null {
  const scale = Math.max(fracLen(total), fracLen(spent));
  const t = scaled(total, scale);
  const s = scaled(spent, scale);
  if (s > t) throw new LedgerError('PRECONDITION_FAILED', 'Insufficient holding balance.');
  if (s === t) return null;
  const diff = (t - s).toString().padStart(scale + 1, '0');
  return scale === 0 ? diff : `${diff.slice(0, diff.length - scale)}.${diff.slice(diff.length - scale)}`;
}

function fracLen(v: string): number {
  const i = v.indexOf('.');
  return i === -1 ? 0 : v.length - i - 1;
}

function scaled(v: string, scale: number): bigint {
  const i = v.indexOf('.');
  const int = i === -1 ? v : v.slice(0, i);
  const frac = i === -1 ? '' : v.slice(i + 1);
  return BigInt(int + frac.padEnd(scale, '0'));
}

/** Parties the demo can act as; re-exported so screens need one import. */
export const DEMO_AUDITOR = AUDITOR;
