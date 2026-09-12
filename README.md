# Private Treasury RFQ

A corporate treasury requests quotes from several dealers on Canton. Each dealer sees only its own price — enforced by the ledger, not the UI.

## What an RFQ is

RFQ means Request for Quote. A treasury publishes the trade it wants done — asset, side, size — invites selected dealers to price it privately, compares the quotes, picks one, and that pair settles. Demo scenario: the treasury sells 10 cETH for USD. Dealer A quotes 3020, Dealer B 3040, Dealer C 3010. Best bid on a sell is B, so the treasury takes 3040 (30,400.00 USD). A and C learn the RFQ closed and nothing else — not the winner, not the winning price.

## Why Canton

On a public chain every quote is visible to every competitor. Here the RFQ is one shared contract, but each quote is a bilateral contract signed only by the treasury and that dealer. Privacy comes from Daml signatories and observers, so a competitor's price is not in the data the ledger will serve you — there is nothing for the frontend to hide.

## Quickstart

```bash
git clone <repo> && cd hackcanton-season-3-treasury-sell
docker compose up               # builds the DAR, starts a Canton sandbox, seeds the demo, serves the UI
                                # -d detached; logs -f; down (-v wipes ledger state)
docker compose run --rm tests   # the 56-script Daml suite
```

| URL / port | What |
| --- | --- |
| http://localhost:3000 | the app, wired to the live ledger |
| localhost:6864 | Canton JSON Ledger API v2 |
| localhost:6865 | Canton gRPC Ledger API |

<details>
<summary>Native path (no Docker)</summary>

JDK 17+, Node 24. Without the explicit `dpm install 3.5.1`, `dpm build` fails with `target dpm-sdk version not installed`.

```bash
curl https://get.digitalasset.com/install/install.sh | sh
export PATH="$HOME/.dpm/bin:$PATH"   # the installer does not do this for you
dpm install 3.5.1                    # installer pulls latest; this repo pins 3.5.1
dpm build --all && dpm test --package-root daml-test
dpm sandbox                          # terminal 1; then, in terminal 2:
dpm script --dar daml-test/.daml/dist/treasury-rfq-tests-0.0.1.dar \
  --script-name Demo.Bootstrap:bootstrap \
  --ledger-host 127.0.0.1 --ledger-port 6865 --upload-dar true -w
cd frontend && npm install && NEXT_PUBLIC_LEDGER=canton npm run dev
```

With no sandbox at all the app still runs: `NEXT_PUBLIC_LEDGER` defaults to `mock` and serves an in-memory fixture.
</details>

## Architecture

```mermaid
flowchart LR
  UI["Next.js UI"] --> API["Next.js route handlers<br/>act as the selected party"] --> JSON["Canton JSON Ledger API"] --> SBX["Canton sandbox"] --> DAR["treasury-rfq.dar"]
```

## Contract model

```mermaid
flowchart TB
  subgraph shared["Shared — all invited dealers observe"]
    RFQ["RFQ<br/>no prices"] --> Inv["RfqInvitation<br/>one per dealer"]
  end
  subgraph bilateral["Bilateral — treasury + one dealer"]
    Inv -->|SubmitQuote| Q["Quote<br/>carries the price"]
  end
  subgraph post["Post-trade"]
    AT["AcceptedTrade"] -->|"AllocateAsset (seller)"| SI["SettlementInstruction"] -->|"AllocatePaymentAndSettle (buyer)"| SR["SettlementReceipt<br/>auditor observes"]
  end
  Q -->|Accept| AT
  Fill["RfqFill<br/>treasury only, single use"] -. consumed by Accept .-> AT
```

| Template | Signatory | Observers | Purpose |
| --- | --- | --- | --- |
| `RFQ` | treasury | invited dealers | Shared market request. `Close`/`Cancel` take no arguments. |
| `RfqFill` | treasury | none | Single-use right to fill. Stops a double fill without leaking. |
| `RfqInvitation` | treasury | that dealer | Private factory for `SubmitQuote`. |
| `Quote` | treasury + dealer | none | The price. Bilateral. `Accept`, `Revise`, `Withdraw`. |
| `AcceptedTrade` | treasury + dealer | none | Binding terms. `AllocateAsset`. |
| `TokenHolding` | issuer | owner | Mock CIP-56-shaped holding (cETH / USD / CBTC). |
| `SettlementInstruction` | treasury + dealer | none | Half-settled DvP: asset leg allocated, cash leg outstanding. |
| `SettlementReceipt` | treasury + dealer | optional auditor | Immutable post-trade evidence. |

## Privacy model

| Party | Sees |
| --- | --- |
| Treasury | Everything: RFQ, all invitations, all quotes, trade, receipt |
| Losing dealer | Closed RFQ, own quote, own cash. Nothing else. |
| Winning dealer | RFQ, own quote, `AcceptedTrade`, receipt |
| Auditor | `SettlementReceipt` only — no RFQ, no quote, no trade |
| Stranger | Nothing |

Proven by negative assertions in the test suite and re-proven against a live participant with wildcard ACS queries (no template filter, so nothing can be hidden by the query shape).

## Workflow

```mermaid
sequenceDiagram
  participant T as Treasury
  participant A as Dealer A
  participant B as Dealer B
  participant L as Ledger
  participant Au as Auditor
  T->>L: Create RFQ + invitations + RfqFill
  L-->>A: RFQ + own invitation (same for B)
  A->>L: SubmitQuote 3020
  B->>L: SubmitQuote 3040
  Note over A,B: neither sees the other's price
  L-->>T: Quote A, Quote B
  T->>L: Accept B + Close RFQ (sibling commands)
  L-->>B: AcceptedTrade
  L-->>A: RFQ Closed, no price
  T->>L: AllocateAsset (10 cETH) -> SettlementInstruction
  B->>L: AllocatePaymentAndSettle (30,400 USD)
  L-->>Au: SettlementReceipt
```

Settlement is two-step DvP because a single `Settle` is impossible: it would need the counterparty's holding `ContractId`, and neither party is a stakeholder on the other's holding. Each side allocates its own leg; both signed the instruction, so step two moves both legs atomically. Settled positions: treasury 25 → 15 cETH and +30,400.00 USD; winner 0 → 10 cETH and 1,000,000 → 969,600.00 USD; losing dealers untouched.

## Status

| Layer | State |
| --- | --- |
| Contract model | 8 templates, 11 business choices, 5 modules, 556 lines. Canton SDK 3.5.1. |
| Tests | 56 Daml Script tests, all passing. 100% coverage: 8/8 templates, 19/19 choices. |
| Frontend | Next.js 15 App Router, TypeScript strict, Tailwind v4, 11 routes, 69 source files, zero runtime deps beyond react/react-dom/next. |
| Live ledger | Full round trip driven through the UI against a running sandbox: quote, accept, allocate, settle. |

**Known gaps.** The allocated asset is pinned by `ContractId`, not escrowed — the mock holding has no lock, so a seller can spend it between the two steps (settle then aborts cleanly with contract-not-found; real CIP-56 registries provide the lock). `RFQ.Cancel` does not archive the fill right. `TokenHolding` is a mock; live CIP-56 integration is P2. Settlement requires explicit disclosure of the seller's holding. See [`AGENTS.md`](AGENTS.md) for the design rationale behind each decision and the full gap list.
