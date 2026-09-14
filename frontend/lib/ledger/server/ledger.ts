/**
 * Party-scoped reads and command submission against the participant.
 * SERVER ONLY — this is what the route handlers in `app/api/ledger/*` call.
 *
 * Every function takes `asParty` and every request to the participant carries
 * that party and only that party. There is no place in this file where a wider
 * result is fetched and then narrowed: if a dealer's query returns another
 * dealer's quote, the bug is in the query, not in a missing filter.
 */

import { LedgerError, type LedgerTemplate } from '../client';
import type { CommandRequest, CommandResponse, QueryRequest, QueryResponse } from '../wire';
import type { Contract } from '../types';
import {
  ALL_TEMPLATES,
  activeContracts,
  create,
  createdIn,
  disclosureFor,
  entityOf,
  exercise,
  ledgerEnd,
  requireCreated,
  submit,
  transactions,
  type DisclosedContract,
  type LedgerCommand,
  type Transaction,
} from './json-api';
import {
  decodeCreated,
  decodeHolding,
  decodeInstruction,
  decodeInvitation,
  decodeQuote,
  decodeReceipt,
  decodeRfq,
  decodeTrade,
  eventsFrom,
} from './decode';

/* ── reads ────────────────────────────────────────────────────────────── */

export async function readDesk(request: QueryRequest): Promise<QueryResponse> {
  const { asParty } = request;
  if (!asParty) throw new LedgerError('INVALID_ARGUMENT', 'asParty is required.');
  const templates: LedgerTemplate[] = request.templates?.length ? request.templates : ALL_TEMPLATES;

  const offset = await ledgerEnd();
  const [created, txs] = await Promise.all([
    activeContracts(asParty, templates, offset),
    request.events ? transactions(asParty, offset) : Promise.resolve([]),
  ]);

  return {
    asParty,
    at: new Date().toISOString(),
    offset,
    contracts: created.flatMap((event) => {
      const decoded = decodeCreated(event);
      return decoded ? [decoded] : [];
    }),
    events: eventsFrom(txs),
  };
}

/* ── commands ─────────────────────────────────────────────────────────── */

export async function runCommand(request: CommandRequest): Promise<CommandResponse> {
  if (!request.asParty) throw new LedgerError('INVALID_ARGUMENT', 'asParty is required.');
  const { asParty } = request;

  switch (request.kind) {
    case 'createRfq': {
      if (request.invitedDealers.length === 0) {
        throw new LedgerError('INVALID_ARGUMENT', 'Invite at least one dealer.');
      }
      const rfqId = request.rfqId ?? newRfqId();
      const terms = {
        rfqId,
        treasury: asParty,
        asset: request.asset,
        quoteCurrency: request.quoteCurrency,
        side: request.side,
        quantity: request.quantity,
        quoteDeadline: request.quoteDeadline,
      };
      // The shared RFQ, the treasury's single-use fill right, and the
      // per-dealer invitations are created in one submission. The treasury is
      // the sole signatory of all of them, and each invitation is observed by
      // its own dealer only — a dealer cannot even count the competition from
      // what it sees here. The RfqFill has NO observers at all: it is the token
      // that stops the treasury binding two dealers to the same quantity, and
      // no dealer ever learns it exists.
      const commands: LedgerCommand[] = [
        create('RFQ', { ...terms, invitedDealers: request.invitedDealers, status: 'Open' }),
        create('RfqFill', { rfqId, treasury: asParty }),
        ...request.invitedDealers.map((dealer) => create('RfqInvitation', { ...terms, dealer })),
      ];
      const tx = await submit(asParty, commands);
      return { offset: tx.offset, rfq: contractOf(tx, 'RFQ', decodeRfq) };
    }

    case 'closeRfq':
    case 'cancelRfq': {
      // Ending an auction must RETIRE the fill right, not just flip the status.
      //
      // `Quote.Accept` deliberately never consults `RFQ.status` (invariant 5:
      // fetching the RFQ would put a node of the accept subtree in front of
      // every invited dealer). The fill right is therefore the only thing that
      // bounds an acceptance — and `Close`/`Cancel` leave every dealer's Quote
      // live. Retire the right and a closed or cancelled auction cannot be
      // filled; leave it and each dealer is writing the treasury a free option
      // for as long as its quote stands.
      //
      // SIBLING, not nested, for the same reason as `acceptQuote` below: the
      // archive is a root command of its own. Archiving the fill from inside a
      // choice on the RFQ would make it a consequence of a node every invited
      // dealer observes, and the dealers would learn the fill right exists —
      // the leak `Tests.Privacy.privacyFillRightIsInvisibleToDealers` forbids.
      // As a root command its only informee is the treasury, which signs it.
      const choice = request.kind === 'closeRfq' ? 'Close' : 'Cancel';
      const fillCid = await unusedFillFor(asParty, request.rfqContractId);
      const commands: LedgerCommand[] = [exercise('RFQ', request.rfqContractId, choice)];
      // Absent only when the RFQ was already filled, which `Close`/`Cancel`
      // reject anyway — so a missing right is never a reason to block the exit.
      if (fillCid) commands.push(exercise('RfqFill', fillCid, 'Archive'));
      const tx = await submit(asParty, commands);
      return { offset: tx.offset, rfq: contractOf(tx, 'RFQ', decodeRfq) };
    }

    case 'acceptQuote': {
      // ─────────────────────────────────────────────────────────────────
      // THE PRIVACY INVARIANT OF THIS PROJECT, IN ONE ARRAY.
      //
      // `Quote.Accept` and `RFQ.Close` are TWO SIBLING COMMANDS in ONE
      // submission. They commit atomically, but they are separate root nodes
      // of the transaction.
      //
      // Nesting instead — closing the RFQ from inside Accept, or accepting
      // from inside Close — would put the accept subtree underneath a node
      // that every invited dealer observes, and Canton discloses a node's
      // consequences to that node's stakeholders. The losing dealers would
      // learn the winner and the winning price.
      //
      // As siblings, a losing dealer is a stakeholder on the RFQ node only:
      // it sees the RFQ close and nothing of the accept. Do not "simplify"
      // this into one command.
      // ─────────────────────────────────────────────────────────────────
      // `Accept` consumes the treasury's fill right, so it needs that
      // contract id. It is resolved here rather than being carried through the
      // UI: `AcceptQuoteCommand` stays {quote, rfq}, and the fill token remains
      // an implementation detail of the treasury's own ACS.
      const fillCid = await fillFor(asParty, request.rfqContractId);
      const tx = await submit(asParty, [
        exercise('Quote', request.quoteContractId, 'Accept', { fillCid }),
        exercise('RFQ', request.rfqContractId, 'Close'),
      ]);
      return {
        offset: tx.offset,
        trade: contractOf(tx, 'AcceptedTrade', decodeTrade),
        rfq: contractOf(tx, 'RFQ', decodeRfq),
      };
    }

    case 'submitQuote': {
      const tx = await submit(asParty, [
        exercise('RfqInvitation', request.invitationContractId, 'SubmitQuote', {
          // Decimal on the wire is the string the desk typed. It is never
          // parsed into a float on the way to the ledger.
          price: request.price,
          expiry: request.expiry,
        }),
      ]);
      return { offset: tx.offset, quote: contractOf(tx, 'Quote', decodeQuote) };
    }

    case 'reviseQuote': {
      const tx = await submit(asParty, [
        exercise('Quote', request.quoteContractId, 'Revise', { newPrice: request.newPrice }),
      ]);
      return { offset: tx.offset, quote: contractOf(tx, 'Quote', decodeQuote) };
    }

    case 'withdrawQuote': {
      const tx = await submit(asParty, [exercise('Quote', request.quoteContractId, 'Withdraw')]);
      return { offset: tx.offset, invitation: contractOf(tx, 'RfqInvitation', decodeInvitation) };
    }

    case 'declineInvitation': {
      // Decline archives and creates nothing; the transaction carries no
      // created event, which is precisely the point of the choice.
      const tx = await submit(asParty, [
        exercise('RfqInvitation', request.invitationContractId, 'Decline'),
      ]);
      return { offset: tx.offset };
    }

    case 'allocateAsset': {
      const tx = await submit(asParty, [
        exercise('AcceptedTrade', request.tradeContractId, 'AllocateAsset', {
          assetHoldingCid: request.assetHoldingCid,
          auditor: request.auditor,
        }),
      ]);
      return {
        offset: tx.offset,
        instruction: contractOf(tx, 'SettlementInstruction', decodeInstruction),
      };
    }

    case 'settle': {
      // The buyer cannot see the seller's allocated holding — TokenHolding's
      // stakeholders are its issuer and its owner, and Canton has no
      // divulgence, so carrying the ContractId on the instruction does not make
      // the contract readable. AllocatePaymentAndSettle fetches it, so the
      // submission has to carry it as an EXPLICIT DISCLOSURE.
      //
      // Reading the blob as the seller here is the out-of-band handoff a real
      // deployment would do between two institutions ("the seller sends the
      // buyer its disclosed contract"); both desks live in this one demo app,
      // so this server performs it. Note what does NOT happen: the seller's
      // holding never reaches the buyer's browser, and the buyer's own ACS
      // query is untouched.
      const disclosure = await discloseAllocatedAsset(asParty, request.instructionContractId);
      const tx = await submit(
        asParty,
        [
          exercise('SettlementInstruction', request.instructionContractId, 'AllocatePaymentAndSettle', {
            paymentHoldingCid: request.paymentHoldingCid,
          }),
        ],
        [disclosure],
      );
      return {
        offset: tx.offset,
        receipt: contractOf(tx, 'SettlementReceipt', decodeReceipt),
        // Both legs moved in this same transaction; hand back the holdings the
        // acting party can now see so the UI need not guess.
        holdings: createdIn(tx, 'TokenHolding').map((event) => ({
          contractId: event.contractId,
          payload: decodeHolding(event.createArgument),
        })),
      };
    }
  }
}

/**
 * The treasury's unused fill right for the RFQ being accepted, or a rejection.
 *
 * `acceptQuote` cannot proceed without one, so the absence is an error here.
 * Ending an auction only retires the right if it is still there, which is what
 * `unusedFillFor` below is for.
 */
async function fillFor(treasury: string, rfqContractId: string): Promise<string> {
  const fill = await unusedFillFor(treasury, rfqContractId);
  if (!fill) {
    throw new LedgerError(
      'PRECONDITION_FAILED',
      'This RFQ has no unused fill right left: it has already been filled, closed or cancelled.',
    );
  }
  return fill;
}

/**
 * The same lookup, reporting absence rather than rejecting it.
 *
 * One ACS read as the treasury covers both halves: the RFQ contract gives the
 * `rfqId`, and the fill token carrying that same id is the one `Accept` would
 * consume. `RfqFill` has the treasury as its only stakeholder, so this read is
 * strictly the treasury's own contracts.
 *
 * A missing RFQ is still an error — you cannot close or accept what is not
 * there — but a missing fill right is not: `closeRfq`/`cancelRfq` must be able
 * to end an auction whose right is already gone.
 */
async function unusedFillFor(treasury: string, rfqContractId: string): Promise<string | null> {
  const offset = await ledgerEnd();
  const events = await activeContracts(treasury, ['RFQ', 'RfqFill'], offset);
  const rfq = events.find((e) => e.contractId === rfqContractId);
  if (!rfq) {
    throw new LedgerError('CONTRACT_NOT_ACTIVE', 'That RFQ is no longer active.');
  }
  const rfqId = decodeRfq(rfq.createArgument).rfqId;
  const fill = events.find(
    (e) => entityOf(e.templateId) === 'RfqFill' && e.createArgument.rfqId === rfqId,
  );
  return fill ? fill.contractId : null;
}

/**
 * The disclosure for the asset leg pinned by a settlement instruction.
 *
 * The instruction is read as the BUYER (a signatory, so this is its own
 * contract) to learn which holding was allocated and who the seller is; the
 * blob is then read as that seller, the only side that can produce it.
 */
async function discloseAllocatedAsset(
  buyer: string,
  instructionContractId: string,
): Promise<DisclosedContract> {
  const offset = await ledgerEnd();
  const entries = await activeContracts(buyer, ['SettlementInstruction'], offset);
  const event = entries.find((e) => e.contractId === instructionContractId);
  if (!event) {
    throw new LedgerError('CONTRACT_NOT_ACTIVE', 'That settlement instruction is no longer active.');
  }
  const instruction = decodeInstruction(event.createArgument);
  return disclosureFor(instruction.seller, 'TokenHolding', instruction.assetHoldingCid, offset);
}

function contractOf<T>(
  tx: Transaction,
  template: LedgerTemplate,
  decode: (row: Record<string, unknown>) => T,
): Contract<T> {
  const event = requireCreated(tx, template);
  return { contractId: event.contractId, payload: decode(event.createArgument) };
}

/** Human-legible and unique. The treasury mints it; the ledger only stores it. */
function newRfqId(): string {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `RFQ-${stamp}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}
