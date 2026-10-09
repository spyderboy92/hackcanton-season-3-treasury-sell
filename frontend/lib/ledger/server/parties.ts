/**
 * Resolves the demo roles onto the participant's actual party ids. SERVER ONLY.
 *
 * A Canton party id is `<hint>-<disambiguator>::<fingerprint>` and the
 * fingerprint is the participant's namespace key — it changes with every fresh
 * sandbox. Hardcoding one guarantees a broken demo on the next restart, so the
 * ids are looked up at runtime.
 *
 * Three sources, strongest last:
 *
 *   1. id-hint matching over the participant's party list (prefixed hints from
 *      `PARTY_HINTS` — what `Demo.Bootstrap` allocates);
 *   2. the operator's `PartyProfile` contracts (`TreasuryRfq.Accounts`), which
 *      bind each seat to a party explicitly and carry its label and
 *      institution. Preferred over hints because they say which party the
 *      seed MEANT, rather than guessing from a suffix;
 *   3. `LEDGER_PARTY_*` overrides, which always win.
 *
 * The operator is resolved the same way (hint `OPERATOR_HINT`, override
 * `LEDGER_PARTY_OPERATOR`) but is NOT a demo role: no desk acts as it and it is
 * never sent to the browser. It is the identity the server uses to read the
 * directory and the login accounts — see `resolveOperator`.
 *
 * If a role cannot be resolved the placeholder id survives. That is a visibly
 * empty desk rather than a crashed app, which is the right failure for a demo.
 */

import { connection } from 'next/server';

import { ledgerBackend } from '../config';
import {
  OPERATOR_HINT,
  PARTY_HINTS,
  PLACEHOLDER_PARTY_IDS,
  applyPartyDirectory,
  applyPartyIds,
  type DemoRole,
  type DirectoryEntry,
} from '../parties';
import type { Party } from '../types';
import { activeContracts, ledgerEnd, listParties } from './json-api';

export interface ResolvedParties {
  ids: Record<DemoRole, Party>;
  /** Roles that had no party on the participant. Empty on a healthy sandbox. */
  unresolved: DemoRole[];
  source: 'mock' | 'participant';
  /** Labels from the operator's PartyProfiles. Empty in mock mode or without profiles. */
  directory: Partial<Record<DemoRole, DirectoryEntry>>;
}

const ENV_OVERRIDE: Record<DemoRole, string> = {
  treasury: 'LEDGER_PARTY_TREASURY',
  dealerA: 'LEDGER_PARTY_DEALER_A',
  dealerB: 'LEDGER_PARTY_DEALER_B',
  dealerC: 'LEDGER_PARTY_DEALER_C',
  auditor: 'LEDGER_PARTY_AUDITOR',
  registry: 'LEDGER_PARTY_REGISTRY',
};

/** Env pin for the app operator (directory / logins). Server only. */
const OPERATOR_OVERRIDE = 'LEDGER_PARTY_OPERATOR';

const ROLES = Object.keys(PARTY_HINTS) as DemoRole[];

/** Re-listing parties on every render would be silly; they change rarely. */
const TTL_MS = 5_000;

interface Resolution {
  parties: ResolvedParties;
  operator: Party | null;
}

let cached: { at: number; value: Resolution } | null = null;

/**
 * The demo roles' party ids and directory labels. Applies both to this
 * process's copy of `lib/ledger/parties.ts` as a side effect, exactly as
 * before, so server components render live values.
 */
export async function resolveDemoParties(): Promise<ResolvedParties> {
  return (await resolve()).parties;
}

/**
 * The operator party, or null if the participant has none (a ledger seeded
 * before HAC-13, or an unreachable one). SERVER ONLY — never serialise it into
 * a response or a prop.
 */
export async function resolveOperator(): Promise<Party | null> {
  return (await resolve()).operator;
}

async function resolve(): Promise<Resolution> {
  if (ledgerBackend() === 'mock') {
    return {
      parties: { ids: { ...PLACEHOLDER_PARTY_IDS }, unresolved: [], source: 'mock', directory: {} },
      operator: null,
    };
  }

  // Reading the participant makes any page that renders a party id
  // request-time work. Saying so up front keeps Next from attempting to
  // prerender it and then bailing out through a thrown fetch.
  await connection();

  const fresh = cached && Date.now() - cached.at < TTL_MS;
  if (fresh && cached) {
    apply(cached.value.parties);
    return cached.value;
  }

  const ids: Record<DemoRole, Party> = { ...PLACEHOLDER_PARTY_IDS };
  const unresolved: DemoRole[] = [];

  let allocated: Party[] = [];
  try {
    // Pinned roles avoid party-list permissions on managed participants.
    if ([...ROLES.map((r) => ENV_OVERRIDE[r]), OPERATOR_OVERRIDE].some((name) => !process.env[name])) {
      allocated = (await listParties()).map((p) => p.party);
    }
  } catch (cause) {
    console.warn('[ledger] could not list parties; falling back to placeholder ids', cause);
  }

  const operator = process.env[OPERATOR_OVERRIDE]?.trim() || pick(allocated, OPERATOR_HINT) || null;
  const profiles = operator ? await readProfiles(operator) : {};

  const directory: Partial<Record<DemoRole, DirectoryEntry>> = {};
  for (const role of ROLES) {
    const profile = profiles[role];
    if (profile) directory[role] = { label: profile.label, institution: profile.institution };

    const override = process.env[ENV_OVERRIDE[role]];
    const match = override || profile?.party || pick(allocated, PARTY_HINTS[role]);
    if (match) ids[role] = match;
    else unresolved.push(role);
  }

  const value: Resolution = { parties: { ids, unresolved, source: 'participant', directory }, operator };
  apply(value.parties);
  // A partial answer (participant still booting, seed still running) is not
  // cached, so the next request tries again instead of serving it for 5s.
  if (unresolved.length === 0) cached = { at: Date.now(), value };
  return value;
}

function apply(parties: ResolvedParties): void {
  applyPartyIds(parties.ids);
  applyPartyDirectory(parties.directory);
}

interface Profile extends DirectoryEntry {
  party: Party;
}

/**
 * The operator's PartyProfiles, by seat. Read AS THE OPERATOR — the only party
 * that is a stakeholder on all of them (each profile is also observed by the
 * party it describes, and by nobody else). A failed read degrades to hint
 * matching rather than failing the render.
 */
async function readProfiles(operator: Party): Promise<Partial<Record<DemoRole, Profile>>> {
  try {
    const offset = await ledgerEnd();
    const events = await activeContracts(operator, ['PartyProfile'], offset);
    const bySeat: Partial<Record<DemoRole, Profile & { offset: number }>> = {};
    for (const event of events) {
      const a = event.createArgument;
      if (a.operator !== operator) continue;
      const seat = a.seat;
      if (typeof seat !== 'string' || !(ROLES as string[]).includes(seat)) continue;
      if (typeof a.party !== 'string' || typeof a.label !== 'string' || typeof a.institution !== 'string') continue;
      // Should be one per seat. If a re-run left two, the newer one is the
      // seed's current intent — the same rule as hint suffixes.
      const prior = bySeat[seat as DemoRole];
      if (prior && prior.offset > event.offset) continue;
      bySeat[seat as DemoRole] = { party: a.party, label: a.label, institution: a.institution, offset: event.offset };
    }
    return bySeat;
  } catch (cause) {
    console.warn('[ledger] could not read the party directory; falling back to id hints', cause);
    return {};
  }
}

/**
 * Pick one allocated party for an id hint.
 *
 * A participant that has been seeded more than once holds several parties for
 * the same hint (`Treasury-1`, `Treasury-2`, …, plus whatever earlier runs
 * left behind). The latest allocation is the one the current fixture uses, and
 * daml-script's disambiguator counts up, so the highest numeric suffix wins.
 * Set `LEDGER_PARTY_*` to override.
 */
function pick(parties: Party[], hint: string): Party | undefined {
  const candidates = parties.filter((p) => {
    const h = p.slice(0, p.indexOf('::') === -1 ? p.length : p.indexOf('::'));
    return h === hint || h.startsWith(`${hint}-`);
  });
  if (candidates.length <= 1) return candidates[0];

  const rank = (p: Party): number => {
    const h = p.slice(0, p.indexOf('::'));
    const suffix = h.slice(hint.length + 1);
    return /^\d+$/.test(suffix) ? Number(suffix) : -1;
  };
  return [...candidates].sort((a, b) => rank(b) - rank(a) || a.localeCompare(b))[0];
}
