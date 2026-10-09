# Treasury RFQ — frontend

Institutional request-for-quote desk on Canton. A corporate treasury raises one
RFQ, three dealers each answer with a private bilateral price, the treasury
accepts the best one and settles delivery versus payment. An auditor sees only
the settlement receipt.

The point of the interface is what it *cannot* show: every screen renders the
active contract set of one party, so a dealer's missing competitors are a
property of the ledger, not a filter in a component.

```
npm install
npm run dev        # http://localhost:3000 — the live ledger by default
NEXT_PUBLIC_LEDGER=mock npm run dev   # no sandbox: the in-memory fixture
npm run typecheck  # tsc --noEmit
npm run build
npm test           # server-side ledger adapter + auth unit tests
```

Ports 6864/6865 belong to the Canton sandbox. This app uses 3000.

Every page needs a login. Demo accounts — **password = username**:
`treasury`, `dealer-a`, `dealer-b`, `dealer-c`, `auditor`. `/signup` creates
more, each bound to one of those seats.

## Screens

| Route | Who may open it | What it proves |
| --- | --- | --- |
| `/login`, `/signup` | anyone | Username + password; signup picks Treasury, Dealer (desk A/B/C) or Auditor. |
| `/` | any signed-in user | Landing page listing only the desks this account may open. |
| `/treasury` | Treasury accounts | Raise an RFQ, rank all three prices, accept, drive settlement. |
| `/dealer/a`, `/b`, `/c` | that dealer's accounts | Own price only. After close: closed RFQ, nothing about the winner. |
| `/auditor` | Auditor accounts | Settlement receipts only, with the read entitlement spelled out. |
| `/demo` | Treasury accounts | Split view. Three prices on the left, one on the right. |

## Accounts and sessions

```
lib/auth/access.ts            account shape, seat ↔ route policy (client-safe)
lib/auth/validate.ts          signup rules; mirrors the Daml `validUsername`
lib/auth/SessionProvider.tsx  the signed-in user, handed down from the root layout
lib/auth/server/*             SERVER ONLY — scrypt hashes, signed cookie, account
                              stores, `allowedParties`, login throttle
app/api/auth/{login,signup,logout,session}/route.ts
middleware.ts                 page routing: /login if anonymous, own desk if not yours
```

**Where accounts live.** On the default (canton) backend, accounts are the
operator's `UserAccount` contracts (`TreasuryRfq.Accounts`). The server finds
the `Operator` party by id hint (or `LEDGER_PARTY_OPERATOR`), reads its ACS to
verify a login, and signs up by exercising `AccountDirectory.Register` as the
operator — the ledger makes the username unique; a duplicate is a 409. Only the
operator is a stakeholder on an account, so the password hash never reaches a
desk. With `NEXT_PUBLIC_LEDGER=mock` the same flow runs on an in-memory store
seeded with the same five accounts and hashes; signups last until restart.

Hashes are `scrypt$N$r$p$<salt>$<key>` (base64url, keylen 32; new signups
N=16384, r=8, p=1, 16-byte random salt), verified with a constant-time compare.
Unknown usernames are verified against a decoy hash, and every credential
failure says "Invalid username or password". Five failures per username and
client address in 15 minutes return 429.

**The session** is an HttpOnly, SameSite=Lax cookie `rfq_session` (Secure over
HTTPS, 8-hour expiry) holding `{ username, userType, seat, exp }` signed with
HMAC-SHA256. It names a **seat**, never a party id: the seat is resolved to the
participant's current party on each request, so re-seeding the sandbox does not
strand signed-in users. Set `SESSION_SECRET`; without it the server generates a
random secret per process (and warns once), so a restart signs everyone out.
`middleware.ts` runs on the Node.js runtime so it shares that per-process
secret with the route handlers.

**The privacy boundary is in the API, not the pages.** `/api/ledger/query` and
`/api/ledger/command` answer 401 without a session and 403 unless `asParty` is a
party the session may act as (`allowedParties` in `lib/auth/server/policy.ts`):
its own seat's party — plus, for a Treasury session only, the three dealer
parties, because the split "Compare views" screen reads a dealer desk and submits
the seller's/buyer's settlement steps from one screen. The auditor and registry
are never reachable that way. `/api/ledger/tip` and `/api/ledger/parties` need a
session. Page redirects in `middleware.ts` are routing on top of that.

## The ledger seam

Nothing in `app/` or `components/` imports the mock. Everything talks to
`LedgerClient`.

```
lib/ledger/types.ts        payload types, mirroring the Daml records
lib/ledger/client.ts       the LedgerClient interface — the contract both backends implement
lib/ledger/mock.ts         in-memory implementation, seeded with the demo fixture
lib/ledger/canton.ts       live implementation — talks to this app's own /api/ledger/* routes
lib/ledger/index.ts        factory — the single swap point, chosen by NEXT_PUBLIC_LEDGER
lib/ledger/config.ts       backend selection, endpoints, poll interval
lib/ledger/wire.ts         request/response shapes shared by the client and the route handlers
lib/ledger/parties.ts      the demo roles; party ids and labels are bound at runtime on a live ledger
lib/ledger/provider.tsx    React context, useDesk / useCommand
lib/ledger/selectors.ts    ranking, spreads, notionals
lib/ledger/view.ts         party-scoped projection of a snapshot onto one RFQ
lib/decimal.ts             BigInt-backed decimal maths; money never becomes a float

lib/ledger/server/*        SERVER ONLY — the JSON Ledger API adapter
app/api/ledger/{query,command,tip,parties}/route.ts
                           the only code that addresses the participant
```

Both backends honour the same two obligations:

1. Every method takes `asParty` and returns only contracts that party is a
   stakeholder on. `listQuotes` returns three rows to the treasury and one to a
   dealer because of the signatory sets, not because of a filter. On the live
   backend the participant computes that answer — no read in `canton.ts` is
   narrowed after the fact.
2. `acceptQuote` submits `Accept` on the winning Quote and `Close` on the RFQ as
   two sibling commands in one submission — never nested. The array that makes
   that true is in `lib/ledger/server/ledger.ts`, commented at the call site.

`subscribe(listener)` polls the participant's ledger END (one integer, every
1.5s, shared across listeners, paused while the tab is hidden) and fires only
when the offset moves; a command advances it immediately so the desk that issued
it does not wait for a tick.

## Running against a live participant

The browser never talks to the ledger. `lib/ledger/canton.ts` posts to this
app's own route handlers, which act as the selected party against the JSON
Ledger API. The API base URL is server-side only and is deliberately not a
`NEXT_PUBLIC_` variable.

```
# 1. a Canton sandbox with the treasury-rfq DAR vetted
#    (gRPC 6865, JSON Ledger API 6864)

# 2. seed the demo scenario: six parties, holdings, one open RFQ, three invitations
export PATH="$HOME/.dpm/bin:$PATH"
dpm build --all
dpm script --dar daml-test/.daml/dist/treasury-rfq-tests-0.0.1.dar \
  --script-name Demo.Bootstrap:bootstrap \
  --ledger-host 127.0.0.1 --ledger-port 6865 --upload-dar true -w

# 3. run the app against it
NEXT_PUBLIC_LEDGER=canton npm run dev
```

| Variable | Default | Meaning |
| --- | --- | --- |
| `NEXT_PUBLIC_LEDGER` | `canton` | The live backend. Exactly `mock` selects the in-memory fixture instead. |
| `LEDGER_NETWORK` | `sandbox` | Server-only profile: `sandbox`, `localnet`, or `devnet`. |
| `LEDGER_JSON_API` | `http://127.0.0.1:6864` in sandbox | Participant JSON Ledger API base URL; required for LocalNet/DevNet. |
| `LEDGER_JWT_TOKEN` | — | LocalNet bearer token, without the `Bearer` prefix. |
| `LEDGER_AUTH0_DOMAIN` | — | DevNet Auth0 tenant host (or HTTPS origin). |
| `LEDGER_AUTH0_CLIENT_ID`, `LEDGER_AUTH0_CLIENT_SECRET` | — | DevNet machine-to-machine application credentials. |
| `LEDGER_AUTH0_AUDIENCE` | — | Audience expected by the DevNet participant. |
| `LEDGER_EXPLORER_URL` | `https://devnet.ccview.io` on DevNet, unset elsewhere | **Server only.** HTTPS explorer for the settlement's ledger transaction id, linked as `<url>/updates/<update id>/`. `off` disables the link; the id is always shown. |
| `NEXT_PUBLIC_LEDGER_ENDPOINT` | `127.0.0.1:6864` | What the status rail displays. |
| `NEXT_PUBLIC_LEDGER_POLL_MS` | `1500` | Ledger-end poll interval. |
| `LEDGER_USER_ID` | `treasury-rfq-ui` | Must match the provisioned ledger user allowed by the token. |
| `LEDGER_PARTY_TREASURY` … `_DEALER_A/B/C`, `_AUDITOR`, `_REGISTRY` | — | Pin a specific party id instead of resolving it. |
| `LEDGER_PARTY_OPERATOR` | — | Pin the operator party (account directory, profiles, logins). Server-only; never sent to the browser. |
| `SESSION_SECRET` | random per process | HMAC key for the session cookie. 32+ random characters. Set it for anything shared or restarted. |

The default is the live ledger: the party directory and the login accounts are
on it, so it is the system of record. Set `NEXT_PUBLIC_LEDGER=mock` explicitly to
build, boot and demo on a machine with no sandbox. On the canton backend an
absent participant still never fails the build or the boot — desks render empty
and say the participant did not answer, and logins report the ledger unavailable.

**Party ids are resolved at runtime.** A Canton party id is
`<hint>-<disambiguator>::<fingerprint>` and the fingerprint changes with every
fresh sandbox, so nothing is hardcoded. The resolver
(`lib/ledger/server/parties.ts`) prefers the operator's on-ledger `PartyProfile`
contracts, which bind each seat to a party explicitly; a seat without a profile
falls back to matching the allocated parties by id hint (`Treasury`, `DealerA`,
…) — where a hint matches several (`Treasury-1`, `Treasury-2`, …) the latest
allocation wins — and `LEDGER_PARTY_*` overrides both. The profiles also carry
each seat's label and institution; the values in `lib/ledger/parties.ts` are the
fallbacks (and what the mock shows). The root layout resolves all of it
server-side and hands it to `<PartyBootstrap>`, so the server and the browser
render the same ids and names.

**Settlement carries an explicit disclosure.** `AllocatePaymentAndSettle` is
exercised by the buyer but fetches the seller's `TokenHolding`, and the buyer is
not a stakeholder on it — Canton has no divulgence, so the ContractId stored on
the instruction is not enough. The settle route reads that holding's disclosure
blob as the seller and attaches it to the buyer's submission
(`disclosedContracts`), which is the wire form of "the seller hands the buyer
its allocated contract". The holding itself never reaches the buyer's browser.

## Sandbox, LocalNet, and DevNet

All three profiles use the same Canton adapter and one participant hosting all
six demo parties. `NEXT_PUBLIC_LEDGER=canton` selects the adapter at build time;
`LEDGER_NETWORK` selects authentication on the server at runtime. Missing external
credentials fail closed: they do not select the sandbox or mock.

Choose an example, copy it to the gitignored local file, and fill in the values:

```bash
cd frontend
cp env/localnet.example .env.local  # or sandbox.example / devnet.example
npm run dev -- --hostname 127.0.0.1
```

Restart after changing server configuration. Rebuild if changing `NEXT_PUBLIC_*`
values. Shell environment variables take precedence over `.env.local`.

- **Sandbox:** no authentication; existing Docker and native commands still work.
- **LocalNet:** obtain a JWT from your LocalNet tooling or operator and set
  `LEDGER_JWT_TOKEN`. Replace it and restart when it expires. HTTP is for local
  trusted connections only; use HTTPS for remote endpoints.
- **DevNet:** obtain the participant URL, Auth0 tenant, client id, client secret,
  and audience from the operator. Authorize the machine-to-machine application
  for that API. The server requests `/oauth/token` with `client_credentials`,
  caches the access token, and refreshes before expiry. Both URLs must use HTTPS.

For each external participant, first upload/vet the model DAR, allocate/host the
parties, and seed the demo holdings and RFQ. `Demo.Bootstrap:bootstrap` needs a
separately authenticated Daml Script connection; frontend credentials do not
configure that tool. Existing sandbox contracts do not migrate.

Provision the authenticated ledger user with read/act rights for the demo's
operating parties and seller-side settlement disclosure reads. Tokens do not
grant rights merely by naming `asParty`. Set `LEDGER_USER_ID` to the actual ledger
user recognized by the participant. Pin all six `LEDGER_PARTY_*` ids when using
managed party names or when party-list permission is unavailable; with all roles
pinned, the app skips party discovery.

**This is still a demo, not hardened public authentication.** Users sign in and
the API only lets a session act as its own seat's party (plus the dealer seats for
a Treasury session — see "Accounts and sessions"), but the server's ledger
credential can still act for every provisioned party, and anyone who reaches the
participant's ports directly bypasses the app entirely. Keep the **participant**
on loopback. Publishing the UI through the Compose `tunnel` profile
(`docker compose --profile tunnel up`, see `env/tunnel.example`) is the intended
judge path — the tunnel may only target `http://frontend:3000`, never
`canton:6864` / `6865`. Never place tokens, client secrets or `SESSION_SECRET` in
`NEXT_PUBLIC_*`, source control, screenshots, or browser requests.

To run only the frontend in Docker against an external participant:

```bash
# From the repository root; stop the existing frontend if it owns port 3000.
docker compose stop frontend
docker compose -f docker-compose.external.yml up --build -d
```

This reads `frontend/.env.local` (override with `FRONTEND_ENV_FILE`). For a
host-based LocalNet, use `http://host.docker.internal:<JSON_API_PORT>` rather than
`127.0.0.1` inside the container. The external compose file does not start or reset
a sandbox. Its display label is generic so participant URLs stay server-side.

Check `GET /api/ledger/parties`: `source` must be `participant` and `unresolved`
must be empty. Then query each party, submit a quote, accept it, allocate, and
settle as in the sandbox workflow. Verify outsider blindness and that the auditor
sees only the final receipt. Configuration examples are placeholders, not
credentials or pre-provisioned DevNet access.

```bash
npm run test:ledger  # profile, JWT, Auth0 cache/refresh, adapter, disclosure and auth tests
npm run typecheck
npx eslint .
npm run build
```

## Fixture

Treasury sells 10 cETH against USD. Dealer A bids 3020.00, Dealer B 3040.00,
Dealer C 3010.00; the best bid on a sell is 3040.00, so 30,400.00 USD changes
hands. Treasury opens with 25 cETH, each dealer with 1,000,000 USD, all issued
by a Registry party. The fixture survives a reload within a tab; "Reset" rewinds
it. `Demo.Bootstrap` seeds the same numbers onto a live sandbox, stopping before
the first quote so the quoting, the accept and the settlement are driven from
the UI. Reset is a mock-only affordance — a real ledger does not rewind.

## Design

Dark by default, light supported through the same custom properties. Tokens live
at the top of `app/globals.css`: a blue-black canvas, 1px hairlines instead of
shadow, one brass accent for focus, selection and the best price, and semantic
colour rationed to green (economically good) and red (destructive). All prices,
sizes and party ids are IBM Plex Mono with tabular figures so columns align.
