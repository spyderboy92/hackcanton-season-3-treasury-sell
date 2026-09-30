# Happy-path walkthrough

You are on the home page (**Select an operating identity**). The fixture is
already quoted: Dealer A 3020.00, Dealer B 3040.00, Dealer C 3010.00. Treasury
is selling 10 cETH; best bid is B at 3040.00 (cash leg 30,400.00 USD).

Two ways through. Split view is the shortest.

---

## Path 1 — Split view (fastest)

1. Click **Open the split view**.
2. Confirm the left pane (Treasury) shows three prices; the right pane shows
   only the selected dealer's price. Flip Dealer A / B / C — each still sees
   one price.
3. Click **Accept the best price and close**.  
   RFQ goes Closed. Switch the right pane to Dealer A or C: they see Closed
   and their own quote, not the winner or the clearing price.
4. Click **Allocate the cETH leg**.
5. Click **Allocate payment and settle**.  
   Banner shows **DvP COMPLETE**.

(Mock only) **Reset** rewinds so you can walk it again.

---

## Path 2 — Desk by desk

Same trade, one identity at a time. Use this if you want to feel each seat.

### 1. Treasury — accept the winner

1. Click **Meridian Group Treasury**.
2. Open the RFQ in the blotter.
3. In the quote book, confirm ranked bids: B 3040.00 (best), A 3020.00,
   C 3010.00.
4. On Dealer B's row, click **Accept**.  
   RFQ closes; Settlement highlights **Allocate cETH leg**.

### 2. Treasury — allocate the asset

1. On Settlement, click **Allocate cETH leg**.  
   Treasury is the seller on this Sell RFQ.
2. The payment step is for Dealer B — leave this desk.

### 3. Dealer B — pay and settle

1. Back to home → **Brightwater Capital** (Dealer B).
2. On Settlement, click **Allocate payment and settle**.  
   Receipt appears; both legs moved in one transaction.

### 4. Privacy checks

1. **Arclight Markets** (Dealer A) or **Castellan Securities** (Dealer C):
   RFQ Closed, own quote only — no winner, no clearing price, no receipt.
2. **Halvorsen Assurance** (Auditor): `SettlementReceipt` only (10 cETH /
   30,400.00 USD / 3040.00). No RFQ, no quotes.
3. **Meridian Group Treasury**: closed RFQ, receipt, holdings 15 cETH and
   +30,400.00 USD.

---

## Live ledger only

If the quote book is empty (sandbox bootstrap stops before quotes), submit
prices first: Dealer A **3020**, Dealer B **3040**, Dealer C **3010**, then
continue from Path 1 step 3 or Path 2 step 1.4. There is no Reset on a live
participant.
