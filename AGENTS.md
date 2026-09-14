# AGENTS.md — working reference for this repository

Deep reference for a coding agent or engineer picking this repo up cold. The
human-facing overview is `README.md`; this file is the one to read before
changing code.

**The core guarantee of this project is a privacy invariant, not a feature set.**
A losing dealer must never be able to learn the winner or the winning price, and
that must be true because the ledger will not serve it — not because a component
filtered it out. Section 3 lists the rules that guarantee it. Read section 3
before editing `daml/` or `frontend/lib/ledger/`.

---

## 1. Orientation

A corporate treasury raises one request for quote (RFQ) on Canton, invites
several dealers, each dealer answers with a private bilateral price, the treasury
accepts the best one, and that pair settles delivery-versus-payment. An auditor
sees the settlement receipt and nothing before it.

The RFQ itself is one shared contract that every invited dealer observes; it
carries terms and never a price. Prices live only on bilateral `Quote` contracts
signed by the treasury and one dealer, with **no observers**. Privacy is Daml
signatories and observers, enforced by the participant.

### Repo map

| Path | Contents |
| --- | --- |
| `daml/` | The contract model package (`treasury-rfq`, version `0.0.1`). `daml/daml.yaml` pins SDK 3.5.1, deps `daml-prim` + `daml-stdlib` only. |
| `daml/daml/TreasuryRfq/*.daml` | 5 modules, 575 lines, 8 templates, 11 business choices. **The comments are load-bearing** — they record why each shape was chosen and what breaks if it changes. |
| `daml-test/` | The test package (`treasury-rfq-tests`), `data-dependencies` on the built DAR of `daml/`. Depends on `daml-script`. |
| `daml-test/daml/Tests.daml` | Suite index and map, plus two aggregate entry points (`privacySuite`, `fullSuite`) for running against a real ledger. |
| `daml-test/daml/Tests/*.daml` | `Fixtures`, `Assertions`, `Lifecycle`, `Privacy`, `Authorization`, `Settlement`. |
| `daml-test/daml/Demo/Bootstrap.daml` | **Not a test.** Seeds a live sandbox with the demo scenario and stops before the first quote. Prints party ids for the frontend. |
| `multi-package.yaml` | `sdk-version: 3.5.1`; packages `./daml`, `./daml-test`. This is what `dpm build --all` reads. |
| `frontend/app/` | Next.js 15 App Router. 11 route files: 5 pages + `layout.tsx` + `not-found.tsx` + 4 API route handlers under `app/api/ledger/`. |
| `frontend/components/` | `desks/` (one per party), `rfq/` (blotter, quote book, ladder, tape…), `shell/`, `primitives/`, `demo/`. |
| `frontend/lib/ledger/` | The ledger seam: `client.ts` (interface), `mock.ts`, `canton.ts`, `index.ts` (factory), `types.ts`, `wire.ts`, `parties.ts`, `provider.tsx`, `selectors.ts`, `view.ts`, `config.ts`. |
| `frontend/lib/ledger/server/` | **SERVER ONLY.** `json-api.ts` (Canton JSON Ledger API v2 adapter), `ledger.ts` (command/query mapping), `parties.ts` (runtime party resolution), `decode.ts`, `http.ts`. Never import these from a component. |
| `frontend/lib/decimal.ts` | BigInt-backed decimal string arithmetic. Money never becomes a float. |
| `docs/PROJECT.md`, `docs/tasks/` | Markdown task tracking index. |
| `log/canton.log` | Sandbox log from a local run. Gitignored directory content; not a source of truth. |
| `Dockerfile.canton`, `docker/`, `docker-compose.yml`, `.dockerignore` | Container path (see section 2). |

### Daml module DAG

Acyclic. Arrows point from importer to imported.

```
                Types  (no imports; enums + derivations + time asserts)
                 ^  ^  ^
                 |  |  |
     Holding     |  |  |          (imports nothing — the CIP-56 seam)
        ^        |  |  |
        |        |  |  |
   Settlement ---+  |  |          (imports Holding, Types)
        ^           |  |
        |           |  |
     Quoting -------+  |          (imports Settlement, Rfq, Types)
        |              |
        v              |
       Rfq ------------+          (imports Types)
```

Concretely:

| Module | Imports | Templates |
| --- | --- | --- |
| `TreasuryRfq.Types` | — | none (enums `Side`, `RfqStatus`; `tradeParties`/`buyerOf`/`sellerOf`; `paymentFor`; `assertNotPast`/`assertInFuture`) |
| `TreasuryRfq.Holding` | — | `TokenHolding` |
| `TreasuryRfq.Rfq` | `Types` | `RFQ`, `RfqFill` |
| `TreasuryRfq.Settlement` | `Holding`, `Types` | `AcceptedTrade`, `SettlementInstruction`, `SettlementReceipt` |
| `TreasuryRfq.Quoting` | `Rfq` (for `RfqFill`), `Settlement` (for `AcceptedTrade`), `Types` | `RfqInvitation`, `Quote` |

**Why `Quoting` holds two templates.** `RfqInvitation` and `Quote` are mutually
recursive at the type level: `RfqInvitation.SubmitQuote` returns
`ContractId Quote`, and `Quote.Withdraw` returns `ContractId RfqInvitation`.
Daml has no forward declarations (no `.hs-boot` equivalent), so the pair cannot
be split across two modules without duplicating a type. The module is named for
the lifecycle the two templates form, not for either one. The same reasoning
colocates `AcceptedTrade` and `SettlementInstruction` in `Settlement`:
`AllocateAsset` returns `ContractId SettlementInstruction` and
`CancelAllocation` returns `ContractId AcceptedTrade`. `SettlementReceipt` is
the terminal state of that same lifecycle and belongs with them.

`Holding` stands alone deliberately: it references nothing else in the model, so
a live CIP-56 registry adapter can replace it without touching `Rfq`, `Quoting`
or `Settlement`.

---

## 2. How to run

### Docker (primary path)

```bash
git clone <repo> && cd hackcanton-season-3-treasury-sell
docker compose up
```

That one command builds the DAR, starts a Canton sandbox, seeds the demo
scenario, and serves the UI.

| URL / port | What |
| --- | --- |
| http://localhost:3000 | the app, wired to the live ledger |
| localhost:6864 | Canton JSON Ledger API v2 |
| localhost:6865 | Canton gRPC Ledger API |

| Command | Effect |
| --- | --- |
| `docker compose up` | build + run in the foreground |
| `docker compose up -d` | detached |
| `docker compose logs -f` | follow logs |
| `docker compose down` | stop; ledger state survives in the volume |
| `docker compose down -v` | stop and **wipe ledger state** (fresh party ids on the next `up`) |
| `docker compose run --rm tests` | run the 58-script Daml test suite |

The toolchain image installs `dpm` and then explicitly `dpm install 3.5.1`
because the installer pulls the latest SDK — see the trap below; the same trap
bites in the container if that line is ever removed.

### Native (secondary path, fully supported)

Prerequisites: JDK 17+, Node 24.

```bash
curl https://get.digitalasset.com/install/install.sh | sh
export PATH="$HOME/.dpm/bin:$PATH"      # trap 1 — the installer does NOT do this
dpm install 3.5.1                       # trap 2 — installer pulls latest; repo pins 3.5.1
dpm build --all                         # builds both packages via multi-package.yaml
dpm test --package-root daml-test       # 58 scripts
```

Then, in two terminals:

```bash
# terminal 1
dpm sandbox                             # gRPC 6865, JSON Ledger API 6864

# terminal 2 — seed the demo scenario and upload the DAR
dpm script --dar daml-test/.daml/dist/treasury-rfq-tests-0.0.1.dar \
  --script-name Demo.Bootstrap:bootstrap \
  --ledger-host 127.0.0.1 --ledger-port 6865 --upload-dar true -w

# terminal 3 — the app against the live participant
cd frontend && npm install && NEXT_PUBLIC_LEDGER=canton npm run dev
```

With **no sandbox at all** the app still runs: `NEXT_PUBLIC_LEDGER` defaults to
`mock` and serves the in-memory fixture. This is deliberate — the app must
build, boot and demo on a machine with no participant.

Frontend-only commands (`frontend/`):

```bash
npm run dev          # next dev -p 3000
npm run build        # next build
npm run start        # next start -p 3000
npm run typecheck    # tsc --noEmit   <- run this after any lib/ change
npm run lint
```

`next.config.ts` honours `NEXT_DIST_DIR`, so a second build (e.g. the canton one)
can land in its own directory instead of clobbering a running server's `.next`.

### Setup traps

1. **`dpm` is not on your PATH after install.** The installer drops it in
   `$HOME/.dpm/bin` and does not modify any shell profile. `dpm: command not
   found` after a clean install means only this. `export PATH="$HOME/.dpm/bin:$PATH"`.
2. **The installer pulls the latest SDK; this repo pins 3.5.1.** Without the
   explicit `dpm install 3.5.1`, `dpm build` fails with
   `target dpm-sdk version not installed` — **a message that never names the
   version it wanted**, which is why this is worth stating twice.

### Re-uploading a rebuilt DAR to a long-lived sandbox

Rebuilding the model and re-running the bootstrap against a sandbox that already
has the old DAR fails with `KNOWN_PACKAGE_VERSION`: the participant already has
a package with that name and version (`treasury-rfq-0.0.1`) but a different
package id, and the stale package id is still vetted. Two ways out:

* Un-vet the stale package id through the admin API, then upload; or
* **Restart the sandbox.** Usually faster, and it has a second benefit: party
  allocation starts clean, so `Demo.Bootstrap` produces plain `Treasury::…`,
  `DealerA::…` party ids instead of accumulating `Treasury-1`, `Treasury-2`,
  `Treasury-3`… (`Tests.Fixtures.allocateDemoParties` suffixes each cast after
  the first on the same ledger, and `frontend/lib/ledger/server/parties.ts` then
  has to guess which one you meant — highest numeric suffix wins).

Bump the package `version` in `daml/daml.yaml` only if you genuinely intend two
coexisting versions on one participant; the frontend addresses templates by
package **name** (`#treasury-rfq:…`), so a version bump is invisible to it as
long as exactly one build is vetted.

---

## 3. THE INVARIANTS

These are the rules the project exists to demonstrate. Each is written the way a
change request will arrive ("can't we just…") followed by why the answer is no.

Two Canton semantics facts underpin all of them, and they are the ones most often
forgotten:

* **A choice's arguments and its entire consequence subtree are disclosed to the
  stakeholders of the contract the choice is exercised on.** Everything below an
  exercise node reaches everyone who is a signatory or observer of the contract
  that node is on.
* **A `fetch` node's informees include the stakeholders of the contract being
  fetched.** Merely reading a contract inside a choice body pulls that contract's
  stakeholders into that part of the transaction.

Canton has **no divulgence**: seeing a `ContractId` in a payload does not make
the contract readable. That is a separate fact and it drives invariant 4.

### Invariant 1 — Correlate by `rfqId : Text`, never by `ContractId`

Every cross-template link in this model is the text field `rfqId`. `RfqInvitation`,
`Quote`, `AcceptedTrade`, `SettlementInstruction`, `SettlementReceipt` and
`RfqFill` all carry it, and none of them stores a `ContractId` pointing at the
RFQ.

*Why:* `RFQ.Close` and `RFQ.Cancel` are consuming — they archive the RFQ and
create a new one with the new status. Any stored `ContractId RFQ` is invalidated
the moment the auction closes.

*Why not contract keys:* a Daml contract key needs maintainers, and a key lookup
by a maintainer leaks the existence of the keyed contract to those maintainers.
That is the wrong shape here.

*Failure mode if broken:* every downstream contract holding a stale
`ContractId RFQ` becomes unresolvable after `Close`; settlement and the UI break
after the accept, and the "fix" that suggests itself (making `Close`
non-consuming, or passing ids around) walks straight into invariant 2.

*The one legitimate `ContractId` in a payload* is
`SettlementInstruction.assetHoldingCid`, which pins the seller's allocated
holding. It is a pin, not an escrow — see section 8.

### Invariant 2 — `RFQ.Close` and `RFQ.Cancel` take NO arguments, and no choice on `RFQ` may touch a `Quote`

```daml
choice Close : ContractId RFQ
  controller treasury
  do
    assertMsg "only an Open RFQ can be closed" (status == Open)
    create this with status = Closed
```

Every invited dealer is an **observer** of the `RFQ`. Therefore, on this template:

* no choice may take a price, a dealer, or a quote id as an argument;
* no choice may `fetch` or `exercise` a `Quote`, an `RfqInvitation`, or an
  `AcceptedTrade`.

**The trap.** `Close` looks like it should take the winning quote id — one
command, obviously atomic, and the RFQ "knows" how it ended. It must not. The
argument list of an exercise node is disclosed to the stakeholders of the
contract it is exercised on, and every losing dealer is a stakeholder on the RFQ.
`Close { winningQuote = <cid> }` hands Dealer A and Dealer C the winner's
contract id; a `fetch` of it inside the body would hand them the price as well,
and the created `AcceptedTrade` would hang in a subtree they are informees of.
Dealer A would read the winning price off its own transaction stream. That is
precisely the leak this project exists to prevent.

`Closed` and `Cancelled` are distinct statuses so a dealer can learn *that* the
auction ended and *how* it ended, without learning the outcome.

*Failure mode if broken:* `Tests.Privacy.privacyLosingDealerBlindAfterAccept` and
`privacyLosingDealerFinalAcs` fail — but note that they fail by *seeing more*, so
a change that also loosens the tests will pass silently. Do not loosen them.

### Invariant 3 — `Quote.Accept` and `RFQ.Close` are SIBLING commands in one submission, never nested

The submission carries a **list** of two root commands:

```ts
// frontend/lib/ledger/server/ledger.ts, case 'acceptQuote'
const tx = await submit(asParty, [
  exercise('Quote', request.quoteContractId, 'Accept', { fillCid }),
  exercise('RFQ',   request.rfqContractId,   'Close'),
]);
```

and in Daml Script (`Tests.Fixtures.acceptedRfq`) with `liftA2` — `Commands` is
an `Applicative` and deliberately **not** a `Monad`, so the two commands cannot
depend on each other and neither can end up inside the other's subtree.

*Why:* one submission is one atomic transaction, so the auction cannot close
without the winner being bound or vice versa — but the two exercises are separate
**root nodes**. A losing dealer is a stakeholder on the `RFQ` node only. It
observes "the auction closed" and sees nothing of the `Accept` subtree.

*Failure mode if broken:* nesting (closing the RFQ from inside `Accept`, or
accepting from inside `Close`) puts the winner, the price and the `AcceptedTrade`
underneath a node every invited dealer observes. Atomicity is unchanged — which is
what makes the mistake tempting; the only thing that changes is who can read the
result.

Both backends must keep this property. In `mock.ts` the equivalent is that
`acceptQuote` archives the quote, creates the trade and transitions the RFQ in
one method with disjoint stakeholder sets per row.

### Invariant 4 — Settlement is a two-step DvP; there is no single `Settle`

```
AcceptedTrade --AllocateAsset (seller)--> SettlementInstruction
SettlementInstruction --AllocatePaymentAndSettle (buyer)--> SettlementReceipt
```

*Why a single `Settle` is impossible, not merely inconvenient:* it would need
both holdings' `ContractId`s in one choice argument. Neither party is a
stakeholder on the other's `TokenHolding` (stakeholders are the issuer and the
owner), and Canton has no divulgence, so neither party can learn the other's
holding id, and putting it in a payload would not make it readable anyway.
Each side must therefore nominate its own leg.

*Why that is still atomic:* both parties sign the `SettlementInstruction`, so the
seller's authority is present in the buyer's exercise. Step two performs **both**
`Transfer`s inside one exercise — there is no instant at which one side has
delivered and the other has not, and no free option at the moment of exchange.

*The consequence you must not forget:* the buyer's submission has to carry the
seller's allocated holding as an **explicit disclosure** (`disclosedContracts`).
Authority is present; *visibility* is not. Without the disclosure the submission
is rejected with "Attempt to fetch or exercise a contract not visible to the
reading parties" — before the choice body runs. Pinned by
`Tests.Settlement.settlementRequiresDisclosureOfTheSellersLeg` and implemented in
`frontend/lib/ledger/server/ledger.ts` (`discloseAllocatedAsset`) +
`json-api.ts` (`disclosureFor`).

### Invariant 5 — `RfqFill` is what stops a double fill; do not replace it with a status check on the RFQ

`RfqFill` is signed by the treasury, has **no observers**, carries only
`{ rfqId, treasury }` — no price, no dealer, not even a count of dealers — and is
created in the same submission as the RFQ. `Quote.Accept` fetches it, checks
`rfqId` and `treasury` match, and archives it.

*The tempting simplification:* delete `RfqFill` and have `Accept` fetch the RFQ
and assert `status == Open`.

*Why that leaks:* a fetch node's informees include the stakeholders of the
contract fetched, and every invited dealer observes the RFQ. Fetching the RFQ
inside `Accept` puts a node of the acceptance subtree in front of the losing
dealers. `RfqFill` is safe to fetch from inside `Accept` for exactly the opposite
reason: the treasury is its only stakeholder, so no dealer — winner or loser —
becomes an informee of that fetch. The winning dealer witnesses the archive only
as a consequence of the `Quote` it already signs, and learns nothing from it
beyond the fact that a fill right existed.

*What breaks without it:* `Accept` consults no shared state, so nothing else stops
the treasury binding two dealers to the same quantity. Covered by
`Tests.Authorization.authTreasuryCannotAcceptTwoQuotes`,
`authFillRightIsScopedAndSingleUse`, `authFillRightIsTreasuryOnly`, and
`Tests.Privacy.privacyFillRightIsInvisibleToDealers`.

*The obligation this creates:* because `Accept` never reads `status`, the fill
right is the **only** thing that bounds an acceptance in time. `Close` and
`Cancel` archive nothing but the RFQ — every dealer's `Quote` survives them — so
any submission that ends an auction must **retire the fill right as a sibling
root command**, or the closed or cancelled auction stays fillable at yesterday's
price and each invited dealer is writing the treasury a free option. Sibling, not
nested, for the same reason as invariant 3: archiving it from inside a choice on
the RFQ would make the archive a consequence of a node every invited dealer
observes, disclosing that the right exists at all. Both the Canton client
(`closeRfq`/`cancelRfq` in `frontend/lib/ledger/server/ledger.ts`) and the mock
(`transitionRfq` in `frontend/lib/ledger/mock.ts`) do this, and
`Tests.Authorization.authEndedRfqCannotBeFilled` pins it.

*What it does not bound:* minting. See section 8 — the treasury can create a
second right for the same `rfqId`, and no ledger-level fix is available.

`RfqFill` is also absent from the frontend's `LedgerTemplate` union and from
`types.ts` on purpose: no read returns it, so no screen can render it. The
`WireTemplate` union in `server/json-api.ts` adds it back solely because commands
must address it, and `ALL_TEMPLATES` filters it out of every query.

### Invariant 6 — Never filter for privacy in application code

Every read is party-scoped at the participant. `readDesk` sends exactly one party
in `filtersByParty`; there is no wider read that is narrowed afterwards. The only
client-side narrowing anywhere is by `rfqId` (picking one auction out of the ones
the party can already see) and by holding `owner` (a "my positions" view) — both
commented at the call site, neither a confidentiality boundary.

*Failure mode if broken:* the demo's entire claim collapses. A UI filter is
indistinguishable from a ledger guarantee in a screenshot and completely
different in reality. If a dealer's query returns another dealer's quote, the bug
is in the query, not in a missing filter — fix the query.

### Invariant 7 — Money is a decimal string end to end

`Decimal` is `string` in `types.ts`, on the wire, and in the DOM. Arithmetic goes
through `frontend/lib/decimal.ts` (BigInt-backed). Nothing calls `parseFloat` on
money.

In Daml, `paymentFor quantity price = quantity * price` is defined **once** in
`TreasuryRfq.Types` and used by `Quote.Accept` and `AcceptedTrade.AllocateAsset`,
and `SettlementInstruction.ensure` re-asserts
`paymentAmount == assetQuantity * price`. Daml's `Decimal` multiplication rounds,
so recomputing through a second expression can produce a different value and the
`ensure` will reject the contract.

*Failure mode if broken:* a cash leg that differs from the accepted terms by a
rounding unit, rejected at `ensure` time — or, worse, an IEEE-754 price
displayed as `3039.9999999999995`.

---

## 4. Contract model reference

Everything below is read off `daml/daml/TreasuryRfq/`. **All choices are
consuming** (no `nonconsuming` anywhere in the model), and no template has a
contract key. 8 templates, 11 business choices, plus 8 implicit `Archive` =
19 choices.

### 4.1 Shared vocabulary (`TreasuryRfq.Types`, no templates)

| Item | Signature | Notes |
| --- | --- | --- |
| `Side` | `Buy \| Sell` | Always from the **treasury's** point of view. |
| `RfqStatus` | `Open \| Closed \| Cancelled` | Distinct so a dealer learns the auction ended, not how. |
| `tradeParties` | `Side -> Party -> Party -> (Party, Party)` | Returns `(buyer, seller)`. `Sell` → `(dealer, treasury)`; `Buy` → `(treasury, dealer)`. |
| `buyerOf` / `sellerOf` | `Side -> Party -> Party -> Party` | The single definition. Buyer/seller are never stored on a template that can derive them. |
| `paymentFor` | `Decimal -> Decimal -> Decimal` | `quantity * price`. Single definition — see invariant 7. |
| `assertNotPast` | `Text -> Optional Time -> Update ()` | `None` means "no deadline". Uses `getTime` (ledger time). |
| `assertInFuture` | `Text -> Optional Time -> Update ()` | Mirror; a set moment must still lie ahead. |

### 4.2 Templates

#### `TokenHolding` — `TreasuryRfq.Holding`

| | |
| --- | --- |
| Fields | `issuer : Party`, `owner : Party`, `symbol : Text`, `amount : Decimal` |
| Signatory | `issuer` |
| Observer | `owner` |
| `ensure` | `amount > 0.0 && symbol /= ""` |

| Choice | Args | Returns | Controller | Assertions / effects |
| --- | --- | --- | --- | --- |
| `Transfer` | `newOwner : Party`, `transferAmount : Decimal` | `(ContractId TokenHolding, Optional (ContractId TokenHolding))` | `owner` | `transferAmount > 0.0`; `transferAmount <= amount`. Creates the transferred holding for `newOwner`; creates a change holding for the sender unless `transferAmount == amount`, in which case the second element is `None`. Issuer stays signatory of both (authorised because the issuer signs the holding being spent). |

Mock CIP-56-shaped asset, isolated so a live registry adapter can replace it.
**No lock primitive** — see section 8.

#### `RFQ` — `TreasuryRfq.Rfq`

| | |
| --- | --- |
| Fields | `rfqId : Text`, `treasury : Party`, `asset : Text`, `quoteCurrency : Text`, `side : Side`, `quantity : Decimal`, `quoteDeadline : Optional Time`, `invitedDealers : [Party]`, `status : RfqStatus` |
| Signatory | `treasury` |
| Observer | `invitedDealers` |
| `ensure` | `rfqId /= "" && quantity > 0.0 && asset /= "" && quoteCurrency /= "" && not (null invitedDealers) && notElem treasury invitedDealers` |

| Choice | Args | Returns | Controller | Assertions / effects |
| --- | --- | --- | --- | --- |
| `Close` | **none** | `ContractId RFQ` | `treasury` | `status == Open`. Recreates with `status = Closed`. Must be submitted with the RFQ's `RfqFill` archived as a **sibling** command (invariant 5). |
| `Cancel` | **none** | `ContractId RFQ` | `treasury` | `status == Open`. Recreates with `status = Cancelled`. Same sibling-archive obligation as `Close`. |

Argument-free by invariant 2. Archive-and-recreate so dealers observe the state
change rather than merely losing the contract. Neither choice can retire the fill
right itself — that would disclose the right to every invited dealer — so the
retirement is the submitter's obligation, discharged as a sibling root command.

#### `RfqFill` — `TreasuryRfq.Rfq`

| | |
| --- | --- |
| Fields | `rfqId : Text`, `treasury : Party` |
| Signatory | `treasury` |
| Observer | **none** |
| `ensure` | `rfqId /= ""` |
| Choices | none beyond implicit `Archive` — consumed by `Quote.Accept`, and archived as a sibling command alongside `RFQ.Close` / `RFQ.Cancel` (invariant 5) |

#### `RfqInvitation` — `TreasuryRfq.Quoting`

| | |
| --- | --- |
| Fields | `rfqId : Text`, `treasury : Party`, `dealer : Party`, `asset : Text`, `quoteCurrency : Text`, `side : Side`, `quantity : Decimal`, `quoteDeadline : Optional Time` |
| Signatory | `treasury` |
| Observer | `dealer` |
| `ensure` | `rfqId /= "" && quantity > 0.0 && asset /= "" && quoteCurrency /= "" && treasury /= dealer` |

| Choice | Args | Returns | Controller | Assertions / effects |
| --- | --- | --- | --- | --- |
| `SubmitQuote` | `price : Decimal`, `expiry : Optional Time` | `ContractId Quote` | `dealer` | `price > 0.0`; `assertNotPast` on `quoteDeadline`; `assertInFuture` on `expiry`. Creates `Quote` with `submittedAt = getTime`. |
| `Decline` | none | `()` | `dealer` | No assertions, creates nothing. Deliberately empty so the treasury learns nothing about why. |

One invitation per dealer: the private factory that lets a dealer mint a `Quote`
carrying the treasury's signature without the treasury ever co-signing a price on
the shared RFQ. A competitor cannot tell from an invitation how many dealers were
invited.

#### `Quote` — `TreasuryRfq.Quoting`

| | |
| --- | --- |
| Fields | `rfqId : Text`, `treasury : Party`, `dealer : Party`, `asset : Text`, `quoteCurrency : Text`, `side : Side`, `quantity : Decimal`, `price : Decimal`, `quoteDeadline : Optional Time`, `expiry : Optional Time`, `submittedAt : Time` |
| Signatory | `treasury`, `dealer` |
| Observer | **none** — this is the contract the whole privacy story turns on |
| `ensure` | `rfqId /= "" && quantity > 0.0 && price > 0.0 && asset /= "" && quoteCurrency /= "" && treasury /= dealer` |

| Choice | Args | Returns | Controller | Assertions / effects |
| --- | --- | --- | --- | --- |
| `Accept` | `fillCid : ContractId RfqFill` | `ContractId AcceptedTrade` | `treasury` | `assertNotPast` on `expiry`; fetch `fillCid` and assert `fill.rfqId == rfqId` and `fill.treasury == treasury`; **archive `fillCid`**; assert `paymentFor quantity price > 0.0`. Creates `AcceptedTrade` with `acceptedAt = getTime`. Must be submitted as a sibling of `RFQ.Close` (invariant 3). |
| `Revise` | `newPrice : Decimal` | `ContractId Quote` | `dealer` | `newPrice > 0.0`; `assertNotPast` on `quoteDeadline`; `assertNotPast` on `expiry`. Recreates with the new price and `submittedAt = getTime`. |
| `Withdraw` | none | `ContractId RfqInvitation` | `dealer` | No assertions. Recreates the invitation (carrying `quoteDeadline`) so the dealer can quote again — which is why the deadline is stored on the Quote at all. |

`quoteDeadline` is carried from the invitation so `Withdraw` can restore it and
`Revise` can enforce it. `Tests.Authorization.authWithdrawIsNotAnEscapeFromTheDeadline`
is the regression test for that.

#### `AcceptedTrade` — `TreasuryRfq.Settlement`

| | |
| --- | --- |
| Fields | `rfqId : Text`, `treasury : Party`, `dealer : Party`, `asset : Text`, `quoteCurrency : Text`, `side : Side`, `quantity : Decimal`, `price : Decimal`, `acceptedAt : Time` |
| Signatory | `treasury`, `dealer` |
| Observer | none |
| `ensure` | `rfqId /= "" && quantity > 0.0 && price > 0.0 && asset /= "" && quoteCurrency /= "" && treasury /= dealer` |

| Choice | Args | Returns | Controller | Assertions / effects |
| --- | --- | --- | --- | --- |
| `AllocateAsset` | `assetHoldingCid : ContractId TokenHolding`, `auditor : Optional Party` | `ContractId SettlementInstruction` | `sellerOf side treasury dealer` | Fetches the holding; `holding.owner == seller`; `holding.symbol == asset`; `holding.amount >= quantity`. Creates the instruction with `paymentAmount = paymentFor quantity price`. |

Buyer and seller are **not stored** — derived from `side` through
`TreasuryRfq.Types`, so no denormalised copy can contradict the terms.

#### `SettlementInstruction` — `TreasuryRfq.Settlement`

| | |
| --- | --- |
| Fields | `rfqId : Text`, `treasury : Party`, `dealer : Party`, `side : Side`, `asset : Text`, `assetQuantity : Decimal`, `quoteCurrency : Text`, `paymentAmount : Decimal`, `price : Decimal`, `acceptedAt : Time`, `assetHoldingCid : ContractId TokenHolding`, `auditor : Optional Party` |
| Signatory | `treasury`, `dealer` |
| Observer | none |
| `ensure` | `rfqId /= "" && assetQuantity > 0.0 && paymentAmount > 0.0 && price > 0.0 && asset /= "" && quoteCurrency /= "" && treasury /= dealer && paymentAmount == assetQuantity * price` |

| Choice | Args | Returns | Controller | Assertions / effects |
| --- | --- | --- | --- | --- |
| `AllocatePaymentAndSettle` | `paymentHoldingCid : ContractId TokenHolding` | `ContractId SettlementReceipt` | `buyerOf side treasury dealer` | Fetch payment holding: `owner == buyer`, `symbol == quoteCurrency`, `amount >= paymentAmount`. Fetch `assetHoldingCid`: `owner == seller`, `symbol == asset`, `amount >= assetQuantity`. Then `Transfer` the asset to the buyer and the cash to the seller **in this same transaction**. Creates the receipt with `settledAt = getTime`. **Requires explicit disclosure of the seller's holding** (invariant 4). |
| `CancelAllocation` | none | `ContractId AcceptedTrade` | `sellerOf side treasury dealer` | No assertions. Recreates the `AcceptedTrade` (`quantity = assetQuantity`), authorised because both of its signatories also sign this instruction. Without it the instruction would be immortal whenever the buyer never pays. |

#### `SettlementReceipt` — `TreasuryRfq.Settlement`

| | |
| --- | --- |
| Fields | `rfqId : Text`, `treasury : Party`, `dealer : Party`, `buyer : Party`, `seller : Party`, `asset : Text`, `assetQuantity : Decimal`, `quoteCurrency : Text`, `paymentAmount : Decimal`, `price : Decimal`, `auditor : Optional Party`, `settledAt : Time` |
| Signatory | `treasury`, `dealer` |
| Observer | `optionalToList auditor` |
| `ensure` | `rfqId /= "" && assetQuantity > 0.0 && paymentAmount > 0.0 && price > 0.0 && asset /= "" && quoteCurrency /= "" && treasury /= dealer && buyer /= seller && paymentAmount == assetQuantity * price` |
| Choices | none beyond implicit `Archive` |

The auditor is added as an observer **only here** — it sees the outcome of the
trade and never a competing quote.

### 4.3 Disclosure summary

| Party | Can see |
| --- | --- |
| Treasury | Everything on its own auctions: RFQ, all invitations, all quotes, the fill right, trade, instruction, receipt, its own holdings |
| Losing dealer | The RFQ (going `Open` → `Closed`/`Cancelled`), its own invitation, its own quote, its own holdings. Nothing else. |
| Winning dealer | The RFQ, its own invitation/quote, `AcceptedTrade`, `SettlementInstruction`, `SettlementReceipt`, its own holdings |
| Auditor | `SettlementReceipt` only |
| Registry | The holdings it issued (it is their signatory) |
| Uninvited stranger | Nothing |

---

## 5. The test suite

### Running it

```bash
dpm test --package-root daml-test                    # all 58 scripts
dpm test --package-root daml-test --all --show-coverage
```

`--all` is **required for a meaningful coverage number.** Without it the model
package is treated as a data-dependency and the report reads a vacuous
`0 defined / 100.0%` — 100% of nothing. With `--all` the bar this repo holds is:

* **8/8 templates**
* **19/19 choices** (11 business + 8 implicit `Archive`)

Against a live ledger, where the per-script runner is unavailable, use the
aggregate entry points:

```bash
dpm script --dar daml-test/.daml/dist/treasury-rfq-tests-0.0.1.dar \
  --script-name Tests:fullSuite --ledger-host 127.0.0.1 --ledger-port 6865 -w
# or Tests:privacySuite for the disclosure assertions alone
```

### Organisation

58 zero-argument `Script`s are discovered by the runner: 49 named assertions,
6 fixture stages, 2 aggregates, and `Demo.Bootstrap:bootstrap`.

| Module | Scripts | Contents |
| --- | --- | --- |
| `Tests` | 2 | `privacySuite`, `fullSuite`. Also the suite **map** — read its header comment first. |
| `Tests.Fixtures` | 6 | `allocateDemoParties` plus the stage chain `openRfq → quotedRfq → acceptedRfq → allocatedRfq → settledRfq`. Every demo constant is defined here and nowhere else. |
| `Tests.Assertions` | 0 | `assertVisible` / `assertBlind` / `assertAllBlind` / `assertOnly`. |
| `Tests.Lifecycle` | 13 | The happy path works. |
| `Tests.Privacy` | 10 | **The centrepiece.** What each party cannot see, at every stage. |
| `Tests.Authorization` | 18 | What each party cannot do — mostly `submitMustFail`; `authKnownLimitationTreasuryCanMintASecondFillRight` is the one that asserts what it still *can*. |
| `Tests.Settlement` | 8 | DvP balances, atomicity under a failed leg, change arithmetic, `CancelAllocation` round trip. |
| `Demo.Bootstrap` | 1 | Not a test. Seeds a live sandbox. |

Stages return **named records**, never positional tuples, and the records are
flat (`fx.parties.dealerA`, not `fx.allocated.accepted.quoted.open.parties.dealerA`).

### The convention that matters: negative assertions are the deliverable

```daml
-- Tests/Assertions.daml
assertVisible : Text -> Party -> Int -> Script [(ContractId t, t)]
assertBlind   : Text -> Party -> Script ()          -- = assertVisible ... 0
assertAllBlind: Text -> [Party] -> Script ()
assertOnly    : Text -> Party -> (t -> Bool) -> Script (ContractId t, t)
```

`assertBlind @Quote "label" dealerA` issues an ACS query **as Dealer A** and
asserts the result is empty. Daml Script's `query` returns exactly what the
ledger API would hand that party, so an empty result is ledger-enforced privacy —
not a UI filter, not a convention, not a permission check in application code.
Failure messages name the party, the template and the counts, so a leak reports
*who* saw *what*.

**Rule for any new choice: it needs both a lifecycle test and a privacy test.**
The privacy test must assert who **cannot** see the contracts the choice creates
or touches, using `assertBlind` / `assertAllBlind` on every party outside the
intended stakeholder set — at minimum `losingDealers fx.parties` and
`fx.parties.stranger`. `stranger` is allocated and never invited to anything
precisely to be that control group. A lifecycle test alone will pass on a model
that broadcasts everything.

Named blind spots proved for a losing dealer: competitor `Quote`, `AcceptedTrade`,
`SettlementInstruction`, `SettlementReceipt`, and `RfqFill`. The one thing it does
see is the shared RFQ transitioning `Open → Closed`.

---

## 6. Frontend architecture

Next.js 15 App Router, TypeScript strict, Tailwind v4, 69 source files, zero
runtime dependencies beyond `react` / `react-dom` / `next`.

### The `LedgerClient` seam

`frontend/lib/ledger/client.ts` is the whole contract between the UI and the
ledger. Two implementations:

| Backend | File | `kind` | Selected by |
| --- | --- | --- | --- |
| In-memory fixture (default) | `lib/ledger/mock.ts` | `'mock'` | anything but `canton` |
| Live participant | `lib/ledger/canton.ts` | `'canton'` | `NEXT_PUBLIC_LEDGER=canton` |

`lib/ledger/index.ts` is the **single swap point** (a memoised singleton). The
default is `mock` on purpose: the app must build, boot and demo with no sandbox
running, so a missing participant degrades rather than fails.

**The rule: no component imports a backend directly.** Nothing in `app/` or
`components/` may import `mock.ts`, `canton.ts`, or anything under
`lib/ledger/server/`. Components reach the ledger through
`lib/ledger/provider.tsx`:

* `useLedger()` — the client from React context
* `useDesk(party)` — `{ snapshot, loading, error, refresh }`, re-read on every
  change the client announces
* `useCommand()` — runs one command at a time and surfaces the rejection verbatim

Three obligations both backends honour, stated at the top of `client.ts`:

1. **Every method is party-scoped.** `asParty` is the acting party — the party the
   command is submitted as and whose ACS is read. A read returns exactly what that
   party is a stakeholder on, never more. Do not filter for privacy in the UI.
2. Reads return `Contract<T>` (`{ contractId, payload }`), because commands need
   the id.
3. Money is a decimal string.

### Server-side path (canton backend)

```
browser (canton.ts)
  -> POST /api/ledger/query | /api/ledger/command,  GET /api/ledger/tip | /api/ledger/parties
     -> lib/ledger/server/ledger.ts   (command -> Daml choice mapping)
        -> lib/ledger/server/json-api.ts  (Canton JSON Ledger API v2)
           -> participant
```

The browser never addresses the participant. `LEDGER_JSON_API` is deliberately
**not** a `NEXT_PUBLIC_` variable. Templates are addressed by package **name**
(`#treasury-rfq:TreasuryRfq.Quoting:Quote`), not package id, so a rebuild does not
break the UI.

`lib/ledger/server/ledger.ts` is where the sibling-command array lives — the
privacy invariant of this project, in one array. Read the comment there before
touching `acceptQuote`.

### Party resolution at runtime

A Canton party id is `<hint>-<disambiguator>::<fingerprint>` and the fingerprint
changes with every fresh sandbox, so **nothing hardcodes one**.

* `lib/ledger/parties.ts` holds the six demo roles with a **mutable id table**
  (`PLACEHOLDER_PARTY_IDS` initially) read through getters. `PARTY_HINTS` maps each
  role to the id hint `Demo.Bootstrap` allocates under.
* `lib/ledger/server/parties.ts` (server only) lists the participant's parties and
  matches by hint, cached for 5s. `LEDGER_PARTY_TREASURY`, `_DEALER_A/B/C`,
  `_AUDITOR`, `_REGISTRY` override. Where a hint matches several parties
  (`Treasury-1`, `Treasury-2`, …) the **highest numeric suffix wins**.
* `app/layout.tsx` resolves once per request, applies the ids to the server's copy
  of the directory, and hands the same ids to `<PartyBootstrap>`, which applies
  them to the browser's copy **in the render body** (idempotent) so children render
  live ids on the first paint and hydration stays quiet.
* An unresolved role keeps its placeholder id — a visibly empty desk rather than a
  crashed app.

### Money

`lib/decimal.ts`: `add`, `subtract`, `multiply`, `divide` (truncating, default
scale 10), `compare`, `round` (half away from zero), `basisPoints`, `format`,
`trim`, `PRECISION`/`precisionFor` (USD 2, cETH 4, CBTC 8). All BigInt-backed over
strings. `format` never returns `NaN` — it returns `—` for a non-decimal.
Derivations that use it live in `lib/ledger/selectors.ts` (`rankQuotes`,
`bestQuote`, `quoteSpreadBps`, `notional`, `isBetter`).

`isBetter(side, a, b)`: on a `Sell` the treasury wants the **highest** bid; on a
`Buy`, the lowest offer. Ties in `rankQuotes` break on the earlier `submittedAt`.

### Change notification

`subscribe(listener)` on the canton backend **polls the participant's ledger end**
— `GET /api/ledger/tip`, one integer, default every 1500 ms
(`NEXT_PUBLIC_LEDGER_POLL_MS`) — and fires only when the offset moves. One interval
is shared by every listener, it stops when the last listener leaves and while the
tab is hidden, and a committed command advances the offset itself so the desk that
issued it does not wait for a tick.

*Why polling and not the update stream:* the JSON Ledger API exposes updates over
**websockets**, which a Next.js route handler cannot hold open on this runtime.
Do not "fix" this by having the browser open a websocket to the participant — that
would put the participant's address in the bundle and break the server-only
boundary.

The mock's `subscribe` fires synchronously after each command instead, and
`reset()` (mock only; optional on the interface) rewinds to the seeded fixture. A
real ledger does not rewind.

### The settle path

`settle` is the one command that carries a `disclosedContracts` entry. The route
reads the instruction as the **buyer** (a signatory) to learn `seller` and
`assetHoldingCid`, then reads the disclosure blob as the **seller** (the only side
that can produce it) and attaches it to the buyer's submission. The seller's
holding never reaches the buyer's browser and the buyer's own ACS query is
untouched. See invariant 4.

### Environment variables

| Variable | Default | Meaning |
| --- | --- | --- |
| `NEXT_PUBLIC_LEDGER` | `mock` | `canton` selects the live backend |
| `LEDGER_JSON_API` | `http://127.0.0.1:6864` | JSON Ledger API base URL. **Server-side only.** |
| `NEXT_PUBLIC_LEDGER_ENDPOINT` | `127.0.0.1:6864` | What the status rail displays |
| `NEXT_PUBLIC_LEDGER_POLL_MS` | `1500` | Ledger-end poll interval (min 250) |
| `LEDGER_USER_ID` | `treasury-rfq-ui` | User id stamped on every submission |
| `APP_ORIGIN` | `http://127.0.0.1:3000` | Where server-side fetches address this app |
| `LEDGER_PARTY_*` | — | Pin a party id instead of resolving it |
| `NEXT_DIST_DIR` | `.next` | Build output directory |

---

## 7. Common tasks — recipes

### Add a choice to an existing template

1. **Check invariant 2 first.** If the template is `RFQ`, the choice may take no
   price, no dealer, no quote id, and may not fetch or exercise a `Quote`,
   `RfqInvitation` or `AcceptedTrade`. If you need any of those, the choice belongs
   on a bilateral template.
2. Write the choice in `daml/daml/TreasuryRfq/<Module>.daml`. Reuse
   `buyerOf`/`sellerOf`/`paymentFor`/`assertNotPast`/`assertInFuture` from
   `TreasuryRfq.Types` rather than re-deriving. Comment *why*, not *what*.
3. If it returns a `ContractId` of a template in another module, check for a cycle
   — you may have to colocate (see section 1).
4. `dpm build --all`.
5. **Lifecycle test** in `daml-test/daml/Tests/Lifecycle.daml`: exercise it from the
   right fixture stage and assert the resulting ACS with `assertVisible` /
   `assertOnly`.
6. **Privacy test** in `Tests/Privacy.daml`: `assertAllBlind` for
   `losingDealers fx.parties`, plus `assertBlind` for `fx.parties.stranger` and any
   other party outside the stakeholder set, on every template the choice creates
   or archives.
7. **Authorization test** in `Tests/Authorization.daml`: `submitMustFail` for every
   party that is not the controller, and one per assertion in the body.
8. Add the new script names to `Tests:fullSuite` (and `privacySuite` if it is a
   privacy script) — the per-script runner finds them automatically, but the
   live-ledger aggregates do not.
9. `dpm test --package-root daml-test --all --show-coverage`; coverage must stay at
   100%.
10. **Frontend, if the UI drives it:** add a `CommandRequest` variant in
    `lib/ledger/wire.ts`, a case in `lib/ledger/server/ledger.ts`, a method on
    `LedgerClient` in `lib/ledger/client.ts`, then implement it in **both**
    `mock.ts` and `canton.ts`. `npm run typecheck` will list what you missed.

### Add a template

1. Decide the module by the dependency direction — see the DAG in section 1. A new
   template that is mutually recursive with an existing one must live in the same
   module.
2. Choose signatories and observers deliberately, and write the reason in the
   template comment. Anything with a competitor as observer needs a paragraph
   justifying it.
3. Add an `ensure` clause. Every template in this model has one; they are the
   cheapest guard available.
4. Correlate to the auction by `rfqId : Text` (invariant 1).
5. `dpm build --all`.
6. Extend `Tests.Fixtures` only if the template belongs on the canonical demo path;
   otherwise build it inside the test that needs it.
7. Lifecycle + privacy + authorization tests, as above. A new template adds one
   template and one implicit `Archive` to the coverage denominator.
8. **Frontend, if a desk renders it:**
   * payload interface in `lib/ledger/types.ts` (decimals as `string`);
   * add the name to the `LedgerTemplate` union in `lib/ledger/client.ts` — *unless
     it is treasury-only like `RfqFill`, in which case deliberately leave it out so
     no read can return it*;
   * `MODULE` entry in `lib/ledger/server/json-api.ts` (and filter it out of
     `ALL_TEMPLATES` if it must not be read);
   * decoder in `lib/ledger/server/decode.ts`;
   * a `DeskSnapshot` field in `client.ts` + both backends;
   * a `stakeholders.*` entry in `mock.ts` that **mirrors the Daml signatory /
     observer sets exactly** — the mock's honesty depends on it.

### Add a screen

1. New route directory under `frontend/app/`, with a `page.tsx` that sets
   `metadata` and renders a component from `components/desks/` (or `components/rfq/`).
   Pages stay thin; the desk component holds the logic.
2. If the screen belongs to a party, get its `PartyInfo` from `lib/ledger/parties.ts`
   (`TREASURY`, `DEALERS`, `dealerBySlug`, `infoForRole`) — never a party-id literal.
   Add a `routeFor` case and, if it is an operating identity, an entry in
   `OPERATING_IDENTITIES`.
3. Read the ledger with `useDesk(info.party)` and project with
   `rfqView(snapshot, rfqId)` / `defaultRfqId(snapshot)` from `lib/ledger/view.ts`.
   Write commands through `useCommand()` + a `useLedger()` method.
4. Render money with `format` from `lib/decimal.ts` at `precisionFor(symbol)`.
   Never `Number(...)` a payload decimal.
5. Reuse `components/primitives/*` (`Panel`, `Table`, `Field`, `Value`, `Status`,
   `PartyTag`, `Sealed`, `EmptyState`, `Notice`, `Timestamp`).
6. **Do not add a `.filter()` that hides a contract from the acting party.** If a
   desk can see something it should not, fix the model or the query — that is the
   bug the project is about.
7. `npm run typecheck && npm run lint && npm run build`.

### Change the fixture

The scenario numbers exist in **two** places that must move together, plus one
that is derived.

1. `daml-test/daml/Tests/Fixtures.daml` — the constants block at the top
   (`demoRfqId`, `demoAsset`, `demoCurrency`, `demoQuantity`, `priceDealerA/B/C`,
   `treasuryAssetBalance`, `dealerCashBalance`, `winningPayment`). Everything in the
   Daml suite and `Demo.Bootstrap` reads from here.
2. Any test that asserts a literal balance — `Tests.Settlement` (`assertBalance`
   call sites), `Tests.Lifecycle.lifecycleOpeningBalances`.
3. `frontend/lib/ledger/mock.ts` — the `seed()` method holds the same numbers for
   the in-memory fixture. **These are separate copies; changing one does not change
   the other.** The presets are `'quoted'` (default, three prices in), `'open'` (no
   quotes) and `'empty'`.
4. `README.md`'s fixture paragraph and this file's section 4/8 references.
5. Re-run `dpm test --package-root daml-test --all --show-coverage` and reload the
   app with a cleared session (the mock persists to `sessionStorage` under
   `rfq.mock.v2` — bump that key if the store shape changes, or the restore will
   deserialise a stale shape).

Current fixture: treasury **sells 10 cETH** vs USD; Dealer A 3020, **Dealer B 3040
(wins — best bid on a sell)**, Dealer C 3010; cash leg **30,400.00 USD**. Opening
balances: treasury 25 cETH, each dealer 1,000,000 USD, all issued by `Registry`.
After settlement: treasury 25 → 15 cETH and +30,400.00 USD; Dealer B 0 → 10 cETH
and 1,000,000 → 969,600.00 USD; Dealers A and C untouched.

---

## 8. Known gaps and non-goals

Stated, not hidden. Each is deliberately unfixed for a recorded reason.

| Gap | Why it is not fixed |
| --- | --- |
| **The allocated asset is pinned by `ContractId`, not escrowed.** `SettlementInstruction.assetHoldingCid` points at a holding that stays under the seller's control, so the seller can `Transfer` or split it between the two DvP steps. | This mock `TokenHolding` has no lock primitive. If the seller does spend it, `AllocatePaymentAndSettle` fails when it fetches the archived id — a contract-not-found rejection, not a clean assert — and the whole transaction aborts: nothing is lost and no partial settlement is possible. The seller does hold an option to walk away between the two steps. In a real deployment the pin is replaced by a **CIP-56 registry lock**, which the registry owns; building a lock or an escrow party into the mock would misrepresent where that responsibility lives. Pinned by `Tests.Settlement.settlementPinnedAssetCanBeSpentBySeller`. |
| **`RfqFill` bounds reuse, not minting.** The treasury is its only signatory, so it can create a second fill right for the same `rfqId` and bind two dealers to the same quantity. | No ledger-level fix is available. Contract keys need LF 2.3 and this package targets 2.2 — and raising the target does not help: **Canton 3.5.1 does not enforce key uniqueness**, verified directly against a 3.5.1 sandbox where two contracts sharing `key (treasury, rfqId)` were both accepted. A key would read as a guarantee while enforcing nothing, which is worse than the stated gap. Enforcement would need a signatory the treasury does not control — a registry or notary party — which is a topology change, not a model change. The exposure is self-inflicted and invisible to dealers (`RfqFill` has no observers), so no dealer can detect it in advance. Exercised by `Tests.Authorization.authKnownLimitationTreasuryCanMintASecondFillRight`. |
| **`TokenHolding` is a mock, not a real CIP-56 asset.** | Live CIP-56 integration is P2. The module is isolated precisely so the swap is local: an adapter replaces `Transfer` and `Settlement`/`Quoting`/`Rfq` are untouched, because all they know about an asset is that it has an owner, a symbol, an amount and a `Transfer` choice. cETH and CBTC are both CIP-56 and differ by registry, not by workflow. |
| **Settlement requires explicit disclosure of the seller's holding.** | Not a bug — it is Canton behaving correctly (no divulgence). It is listed because it is a **real integration requirement**: any client of this model must implement the seller→buyer handoff of the disclosed contract. See invariant 4. |

Non-goals, for the avoidance of scope creep: no Kafka, no Redis, no PQS, no
Kubernetes, no auth/identity provider, no multi-participant topology, no order
book or continuous market, no persistence outside the ledger, and no `Buy`-side
demo path (the model supports `Side = Buy` throughout via `tradeParties`, but the
fixture and the UI exercise `Sell`).

---

## 9. Gotchas

Things that have already cost time.

1. **Sandbox state is ephemeral.** `dpm sandbox` keeps everything in memory;
   `docker compose down -v` wipes the volume. Restarting means re-running
   `Demo.Bootstrap`. Nothing in the repo persists ledger state on purpose.
2. **Party ids change with every fresh sandbox.** The fingerprint half of
   `<hint>-<disambiguator>::<fingerprint>` is the participant's namespace key.
   Never hardcode a party id anywhere — not in a test, not in a component, not in
   a config file. Resolution is by **id hint** at runtime
   (`lib/ledger/server/parties.ts`), with `LEDGER_PARTY_*` as the escape hatch.
3. **Re-seeding one sandbox accumulates suffixed parties.** `Treasury-1`,
   `Treasury-2`, … The resolver takes the highest numeric suffix, which is usually
   right and occasionally not. Restart the sandbox for a clean cast.
4. **Re-uploading a rebuilt DAR fails with `KNOWN_PACKAGE_VERSION`** until the
   stale package id is un-vetted. Restarting the sandbox is usually faster. See
   section 2.
5. **`dpm test` without `--all` reports a vacuous `0 defined / 100.0%`.** The
   coverage number means nothing without `--all` because the model is a
   data-dependency of the test package.
6. **Decimal rounding is real.** Daml's `Decimal` `*` rounds. Compute the cash leg
   through `paymentFor` and only through `paymentFor`; `SettlementInstruction.ensure`
   re-asserts `paymentAmount == assetQuantity * price` and will reject a value
   derived any other way. In TypeScript, use `lib/decimal.ts` — `divide` truncates
   toward zero, `round` is half-away-from-zero, and `multiply` keeps full scale
   (`"10.0" * "3040.0" = "30400.00"`, not `"30400"`), so format for display rather
   than comparing rendered strings.
7. **Settle without a disclosure is rejected before the choice body runs.** The
   error ("Attempt to fetch or exercise a contract not visible to the reading
   parties") reads like an authorization failure and is not — authority is present,
   visibility is not. If you refactor the settle path, keep `discloseAllocatedAsset`.
8. **Mock / ledger parity drifts silently when the model changes.**
   `mock.ts` re-derives stakeholders from payloads (`stakeholders.rfq`,
   `.invitation`, `.quote`, `.trade`, `.instruction`, `.receipt`, `.holding`,
   `.fill`) to mirror the Daml signatory/observer sets. Change a signatory or
   observer in Daml and that table must change too, or the mock will show a desk
   something the real ledger refuses (or hide something it would serve). The mock
   also has **no disclosure concept**, so its `settle` succeeds where the live
   backend would need `disclosedContracts` — always re-test a settlement change
   against `NEXT_PUBLIC_LEDGER=canton`.
9. **`sessionStorage` keeps the mock fixture across reloads in a tab**
   (`rfq.mock.v2`). A "the reset didn't take" report is usually a restored store;
   a new tab starts from the seeded position. Bump the key when the store shape
   changes.
10. **`lib/ledger/server/*` must never reach a browser bundle.** It holds the
    participant's address. Import it only from `app/api/ledger/*/route.ts` and
    `app/layout.tsx` (server components).
11. **Template ids are package-**name** references** (`#treasury-rfq:…`). A
    package-id reference would pin the UI to one build of the DAR and break on
    every recompile.
12. **`activeContracts` and `transactions` return `[]` at offset 0.** A brand-new
    participant with nothing committed yields an empty desk rather than an error;
    do not read that as a broken query.
13. **Daml Script `Commands` is an `Applicative`, not a `Monad`.** That is not an
    inconvenience to route around with sequential `submit`s — it is the type system
    enforcing invariant 3. If you find yourself wanting `>>=` between two commands
    in one submission, one of them belongs in a separate transaction.
