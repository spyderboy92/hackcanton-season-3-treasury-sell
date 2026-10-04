import { cn } from '@/lib/cn';
import { partyLabel } from '@/lib/ledger/parties';
import { sellerOf, type Party } from '@/lib/ledger/types';
import type { RfqView } from '@/lib/ledger/view';

export function WorkflowGuide({ view, asParty }: { view: RfqView; asParty: Party }) {
  const { rfq, trade, instruction, receipt, quotes, invitation } = view;
  const treasury = asParty === rfq.payload.treasury;
  const ended = rfq.payload.status !== 'Open';
  const filled = Boolean(trade || instruction || receipt);
  const stage = receipt ? 3 : filled ? 2 : 1;
  let title: string;
  let detail: string;

  if (receipt) {
    title = 'Settlement complete';
    detail = 'Both assets and payment have transferred. Your receipt is available below.';
  } else if (instruction) {
    title = asParty === instruction.payload.buyer ? 'Next: fund and settle' : 'Waiting for payment';
    detail = `${partyLabel(instruction.payload.buyer)} can now allocate payment and complete the exchange.`;
  } else if (trade) {
    const seller = sellerOf(trade.payload.side, trade.payload.treasury, trade.payload.dealer);
    title = asParty === seller ? 'Next: allocate the asset' : 'Waiting for asset allocation';
    detail = `${partyLabel(seller)} must allocate ${trade.payload.asset} before the buyer can settle.`;
  } else if (ended) {
    title = rfq.payload.status === 'Cancelled' ? 'Request cancelled' : 'Request closed';
    detail = treasury
      ? 'This request has ended. Create a new request to collect more quotes.'
      : 'No trade was assigned to this desk. Other dealers’ results remain private.';
  } else if (treasury) {
    title = quotes.length ? 'Next: review and accept a quote' : 'Waiting for dealer quotes';
    detail = quotes.length
      ? `${rfq.payload.side === 'Sell' ? 'Highest' : 'Lowest'} price ranks first. Review the dealer and total before accepting.`
      : 'Invited dealers can submit their private prices. Check back here to compare them.';
  } else {
    title = quotes.length ? 'Your quote is live' : invitation ? 'Next: submit your price' : 'Invitation declined';
    detail = quotes.length
      ? 'You can revise or withdraw your price while the quote window is open.'
      : invitation
        ? 'Enter a unit price below. Only your desk and the treasury can read it.'
        : 'You have no active invitation or quote for this request.';
  }

  return (
    <section aria-label="Request progress" className="mx-4 overflow-hidden rounded-md border border-line bg-surface">
      <ol className="grid grid-cols-3 border-b border-line">
        {['Request quotes', 'Accept a quote', 'Settle trade'].map((label, index) => (
          <li key={label} aria-current={!ended || filled ? stage === index + 1 ? 'step' : undefined : undefined}
            className={cn('flex items-center gap-2 px-3 py-3 text-mini sm:px-4', stage === index + 1 ? 'bg-raised font-medium text-ink' : 'text-ink-3')}>
            <span aria-hidden className="num flex size-6 shrink-0 items-center justify-center rounded-full bg-canvas text-micro">{index + 1}</span>
            <span>{label}</span>
          </li>
        ))}
      </ol>
      <div className="px-4 py-4" role="status">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="mt-1 max-w-[65ch] text-xs text-ink-2">{detail}</p>
      </div>
    </section>
  );
}
