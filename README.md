# Private Treasury RFQ

HackCanton Season 3 app: a corporate treasury requests quotes from multiple dealers on Canton, while each dealer sees only its own price.

**RFQ** means Request for Quote. The treasury posts the trade it wants (asset, buy/sell, size). Invited dealers reply with private prices. The treasury picks one and settles. Competitors do not see each other’s quotes.

## Status

Daml packages are scaffolded on SDK **3.5.1**. Templates exist with the intended signatories and observers; choices, tests, UI, and the hackathon README are still to be implemented.

## Layout

- `daml/` — ledger contracts (`treasury-rfq`)
- `daml-test/` — Daml Script tests (`treasury-rfq-tests`)
- `frontend/` — not created yet

## Build

Requires [dpm](https://docs.canton.network/sdks-tools/cli-tools/dpm) and JDK 17+.

```bash
dpm build --all
dpm test --package-root daml-test
```

That test currently only checks that the test package imports the contract types.
