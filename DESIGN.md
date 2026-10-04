# Treasury RFQ design system

## 1. Atmosphere and identity

A calm dealing workspace: charcoal surfaces, brass actions, IBM Plex typography and exact, tabular prices. Preserve the existing institutional character while making the next action and acting identity clear. Extracted from the existing primitives; the redesign addresses tiny type, weak contrast, compressed controls and missing workflow guidance.

## 2. Color

| Token | Dark | Light | Purpose |
| --- | --- | --- | --- |
| canvas | #101318 | #f3f4f6 | Page |
| sunken | #0c0f14 | #e9ecf0 | Supporting context |
| surface | #171c24 | #ffffff | Working panels |
| raised | #202733 | #f0f2f5 | Hover and selected surfaces |
| line / line-hi | #303947 / #526073 | #d8dde5 / #8793a3 | Structural edges |
| ink | #edf1f7 | #18212e | Primary text |
| ink-2 / ink-3 / ink-4 | #bcc6d5 / #a3afc0 / #94a1b4 | #475569 / #526176 / #5e6c80 | Supporting text |
| accent / accent-hi | #d7b777 / #ebce94 | #80550d / #684307 | Primary action and focus |
| accent-ink | #171208 | #fffaf0 | Filled action label |
| pos / neg | #79cba7 / #f19588 | #146b49 / #ab3527 | Success and errors |

Existing translucent accent, positive and negative washes remain. Selection uses a tonal wash and an explicit state label; colored selection borders are removed. Focus uses a two-pixel accent outline.

## 3. Typography

IBM Plex Sans for prose and IBM Plex Mono for amounts and identifiers. Micro 11px/16px, mini 12px/18px, xs 13px/20px, sm 14px/22px, base 16px/24px, lg 18px/26px, xl 22px/28px, 2xl 28px/34px, 3xl 36px/40px, 4xl 48px/52px. Labels use 12px medium weight; panel headings 14px semibold; page headings 28px semibold. Keep important copy out of the micro scale.

## 4. Spacing and layout

Use the existing four-pixel spacing grid: 4, 8, 12, 16, 20, 24, 32 and 48px. Shell height 64px. Content maximum 1600px. Desktop desk columns: 240px request list, flexible work area, 288px context. At 768px use a 208px request list and flexible work area, with context below; at 375px stack all three. Document owns vertical scrolling; tables own horizontal scrolling. Every flexible grid child uses min-width: 0. Navigation wraps rather than overflowing.

## 5. Primitives and states

- Buttons: small 36px, medium 44px minimum height; six-pixel radius; primary brass fill, secondary neutral surface, ghost subdued label, danger red label. Disabled and pending states prevent repeated actions and expose aria-busy.
- Panels: ten-pixel radius, neutral border, surface fill; wrapping headings and actions; 16px body padding.
- Fields: 44px controls, six-pixel radius, clear labels, native select arrow, visible keyboard focus. Invalid quantity and deadline show inline guidance. Deadlines accept positive whole minutes or an explicit No quote deadline choice. RFQ forms submit on Enter and offer Cancel.
- Request list: neutral selected wash, aria-current, explicit Selected label, comfortably spaced rows.
- Workflow guide: three ordered stages (request, accept, settle), completed-state check marks and party-specific next-action copy, derived solely from the current party's snapshot. A losing dealer must never get a winner or winning price from this component.
- Quote acceptance: inline review above the table shows dealer, price and total before the final command; Cancel returns to the book. Disable all acceptance controls while a command is pending. Table columns respond to their container: rank and notional at 576px, spread at 768px, party at 864px and received time at 960px. The dealer, price and review action remain visible on compact screens.
- Terms: prominent quantity/instrument, status, secondary reference and deadline; wrap on small screens.

## 6. Motion

Color transitions 150ms, existing pending-state opacity pulse, no decorative entrance effects. Reduced-motion preferences disable animation and transitions. Hover means an actionable control; keyboard focus remains visible.

## 7. Responsive behavior and accessibility

Verify 375, 768 and 1280px plus dark and light themes. No page-level horizontal overflow. Tables may scroll within their container. Keyboard users can skip navigation, submit forms, cancel creation, review an acceptance and switch identities. Use semantic headings, labeled form controls, ordered workflow stages, aria-current and aria-pressed. Text and status communicate state without color alone.

## 8. Constraints and verification

Preserve the ledger seam, Daml privacy invariants and decimal-string arithmetic. Reuse the existing React/Next.js/Tailwind stack and primitives. Do not add runtime styling dependencies. Browser checks cover creation, validation, acceptance, allocation, settlement, dealer isolation and auditor receipts. These checks use the mock backend; live Canton verification is outside this visual change.
