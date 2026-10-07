/**
 * Demo party directory.
 *
 * The five operating identities (plus the token registry) are fixed roles in the
 * demo; their Canton party ids are not. A real participant allocates
 * `<hint>-<disambiguator>::<fingerprint>` and the fingerprint changes with every
 * fresh sandbox, so nothing here may hardcode one.
 *
 * The ids therefore live in a mutable table that is filled in at runtime:
 *
 *   mock    — the placeholder ids below are the ledger's ids, and stay.
 *   canton  — the root layout resolves the real ids from the participant
 *             (`lib/ledger/server/parties.ts`) before anything renders, applies
 *             them to this module on the server, and passes them to
 *             `<PartyBootstrap>` which applies them to this module in the
 *             browser. Both sides therefore render the same ids.
 *
 * The same goes for each seat's `label` and `institution`. They now live on the
 * ledger as the operator's `PartyProfile` contracts (`TreasuryRfq.Accounts`),
 * read server-side and applied through `applyPartyDirectory` exactly like the
 * ids. The values written below are the fallbacks — what the mock shows, and
 * what a participant without profiles shows. `entitlement` stays here: it is
 * explanatory copy about the Daml model, not data about the institution.
 *
 * Everything else in the app keeps reading `TREASURY.party` and friends.
 */

import type { Party } from './types';

export type DeskKind = 'treasury' | 'dealer' | 'auditor' | 'registry';

/** Stable role key. The party id behind it is resolved at runtime. */
export type DemoRole = 'treasury' | 'dealerA' | 'dealerB' | 'dealerC' | 'auditor' | 'registry';

export interface PartyInfo {
  /** Route segment: "treasury", "a", "b", "c", "auditor". */
  slug: string;
  /** Which demo seat this is, independent of the ledger's party id. */
  role: DemoRole;
  /** The live Canton party id. Resolved at runtime on a real participant. */
  readonly party: Party;
  /** Short label used in tables. From the seat's PartyProfile when there is one. */
  readonly label: string;
  /** Full institution name. From the seat's PartyProfile when there is one. */
  readonly institution: string;
  desk: DeskKind;
  /** One line describing the ledger entitlement, shown on the gate. */
  entitlement: string;
}

/**
 * The id hint each role is allocated under. `Demo.Bootstrap` allocates with
 * these hints, and the server-side resolver matches parties by them.
 */
export const PARTY_HINTS: Record<DemoRole, string> = {
  treasury: 'Treasury',
  dealerA: 'DealerA',
  dealerB: 'DealerB',
  dealerC: 'DealerC',
  auditor: 'Auditor',
  registry: 'Registry',
};

/**
 * Ids used by the in-memory fixture, and the pre-resolution placeholders in
 * canton mode. Shaped like real Canton ids so the UI is sized for them.
 */
const FP = {
  treasury: '1220e254a1c9f0b7d3486f0c95a1b7f4e2d80c6b19af734ad9c2e5b18f4a0c73',
  dealerA: '1220a71fc3d8e5b209446cd1f7803ba9e6c412d75f8e0b3ac96d21e4708fb5c6',
  dealerB: '12203f9b6ad0c81e75249ba0e4c73d51f68b2907ae4c1d3f56082bb9e7a41cd2',
  dealerC: '1220c40e82b7f19d63a5710de8c294b3f0a67d15e9b82c04df3671ae59b28d04',
  auditor: '12208d15b0e72fc396a4d1e07b53c8f2a690d4c81e7b35f209ac6d478e01b3f95',
  registry: '1220b6072ce9d41a8f35207ecb14d69a0f8235c7e1b904df628ac35107e9bd42',
} as const;

export const PLACEHOLDER_PARTY_IDS: Record<DemoRole, Party> = {
  treasury: `Treasury-d4d9::${FP.treasury}`,
  dealerA: `DealerA-7b21::${FP.dealerA}`,
  dealerB: `DealerB-9c48::${FP.dealerB}`,
  dealerC: `DealerC-2f60::${FP.dealerC}`,
  auditor: `Auditor-5e13::${FP.auditor}`,
  registry: `Registry-0a95::${FP.registry}`,
};

/** The live table. Mutated by `applyPartyIds`, read through the getters below. */
const IDS: Record<DemoRole, Party> = { ...PLACEHOLDER_PARTY_IDS };

/**
 * Point the directory at a participant's actual party ids. Idempotent, and safe
 * to call on both the server and the client with the same input — which is
 * exactly what the root layout does.
 */
export function applyPartyIds(ids: Partial<Record<DemoRole, Party>>): void {
  for (const [role, party] of Object.entries(ids) as [DemoRole, Party | undefined][]) {
    if (party) IDS[role] = party;
  }
}

/** The ids currently in force, for serialisation to the browser. */
export function partyIds(): Record<DemoRole, Party> {
  return { ...IDS };
}

/** How the directory names one seat. */
export interface DirectoryEntry {
  label: string;
  institution: string;
}

/** Live labels, keyed by role. Empty until a directory is applied; getters fall back. */
const DIRECTORY: Partial<Record<DemoRole, DirectoryEntry>> = {};

/**
 * Apply the on-ledger party directory (the operator's `PartyProfile`s). Same
 * contract as `applyPartyIds`: idempotent, and called with the same input on
 * the server and in the browser so both renders agree. Blank values are
 * ignored rather than rendering an empty label.
 */
export function applyPartyDirectory(entries: Partial<Record<DemoRole, DirectoryEntry>>): void {
  for (const [role, entry] of Object.entries(entries) as [DemoRole, DirectoryEntry | undefined][]) {
    if (entry?.label && entry.institution) DIRECTORY[role] = { label: entry.label, institution: entry.institution };
  }
}

function identity(
  role: DemoRole,
  rest: Omit<PartyInfo, 'party' | 'role'>,
): PartyInfo {
  const { label, institution, ...fixed } = rest;
  return {
    role,
    ...fixed,
    get party() {
      return IDS[role];
    },
    get label() {
      return DIRECTORY[role]?.label ?? label;
    },
    get institution() {
      return DIRECTORY[role]?.institution ?? institution;
    },
  };
}

export const TREASURY: PartyInfo = identity('treasury', {
  slug: 'treasury',
  label: 'Treasury',
  institution: 'Meridian Group Treasury',
  desk: 'treasury',
  entitlement: 'Every RFQ it raised, all invitations, all bilateral quotes, trades and receipts.',
});

export const DEALER_A: PartyInfo = identity('dealerA', {
  slug: 'a',
  label: 'Dealer A',
  institution: 'Arclight Markets',
  desk: 'dealer',
  entitlement: 'RFQ terms it was invited to, its own invitation, its own quote. Nothing else.',
});

export const DEALER_B: PartyInfo = identity('dealerB', {
  slug: 'b',
  label: 'Dealer B',
  institution: 'Brightwater Capital',
  desk: 'dealer',
  entitlement: 'RFQ terms it was invited to, its own invitation, its own quote. Nothing else.',
});

export const DEALER_C: PartyInfo = identity('dealerC', {
  slug: 'c',
  label: 'Dealer C',
  institution: 'Castellan Securities',
  desk: 'dealer',
  entitlement: 'RFQ terms it was invited to, its own invitation, its own quote. Nothing else.',
});

export const AUDITOR: PartyInfo = identity('auditor', {
  slug: 'auditor',
  label: 'Auditor',
  institution: 'Halvorsen Assurance',
  desk: 'auditor',
  entitlement: 'Settlement receipts only. No RFQ terms, no quotes, no pre-trade data.',
});

export const REGISTRY: PartyInfo = identity('registry', {
  slug: 'registry',
  label: 'Registry',
  institution: 'Canton Token Registry',
  desk: 'registry',
  entitlement: 'Issuer of record for cETH and USD holdings.',
});

export const DEALERS: readonly PartyInfo[] = [DEALER_A, DEALER_B, DEALER_C];

/** Identities offered on the entitlements gate, in presentation order. */
export const OPERATING_IDENTITIES: readonly PartyInfo[] = [
  TREASURY,
  DEALER_A,
  DEALER_B,
  DEALER_C,
  AUDITOR,
];

const ALL: readonly PartyInfo[] = [...OPERATING_IDENTITIES, REGISTRY];

/**
 * Linear scans rather than a prebuilt Map: the party ids are late-bound, so a
 * map keyed on them at module load would be stale the moment the real ids land.
 * Six entries — the lookup cost is irrelevant.
 */
export function partyInfo(party: Party): PartyInfo | undefined {
  return ALL.find((p) => p.party === party);
}

export function infoForRole(role: DemoRole): PartyInfo {
  const found = ALL.find((p) => p.role === role);
  if (!found) throw new Error(`unknown demo role: ${role}`);
  return found;
}

/** Short display name for a party id, falling back to the id's hint segment. */
export function partyLabel(party: Party): string {
  return partyInfo(party)?.label ?? hintOf(party);
}

export function institutionOf(party: Party): string {
  return partyInfo(party)?.institution ?? hintOf(party);
}

export function dealerBySlug(slug: string): PartyInfo | undefined {
  const info = ALL.find((p) => p.slug === slug);
  return info?.desk === 'dealer' ? info : undefined;
}

/** The readable prefix of a Canton party id. */
export function hintOf(party: Party): string {
  const i = party.indexOf('::');
  return i === -1 ? party : party.slice(0, i);
}

/** The key fingerprint half of a Canton party id. */
export function fingerprintOf(party: Party): string {
  const i = party.indexOf('::');
  return i === -1 ? '' : party.slice(i + 2);
}

/** "Treasury-d4d9::1220e254…0c73" — full id is kept in a title attribute. */
export function shortParty(party: Party, keep = 6): string {
  const fp = fingerprintOf(party);
  if (!fp) return party;
  return `${hintOf(party)}::${fp.slice(0, keep)}…${fp.slice(-4)}`;
}

/** Where an operating identity lands after the entitlements gate. */
export function routeFor(info: PartyInfo): string {
  switch (info.desk) {
    case 'treasury':
      return '/treasury';
    case 'dealer':
      return `/dealer/${info.slug}`;
    case 'auditor':
      return '/auditor';
    default:
      return '/';
  }
}
