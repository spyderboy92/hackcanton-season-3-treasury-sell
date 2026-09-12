/**
 * Resolves the demo roles onto the participant's actual party ids. SERVER ONLY.
 *
 * A Canton party id is `<hint>-<disambiguator>::<fingerprint>` and the
 * fingerprint is the participant's namespace key — it changes with every fresh
 * sandbox. Hardcoding one guarantees a broken demo on the next restart, so the
 * ids are looked up at runtime by their id hint, which `Demo.Bootstrap`
 * allocates deterministically (Treasury, DealerA, DealerB, DealerC, Auditor,
 * Registry).
 *
 * If a role cannot be resolved the placeholder id survives. That is a visibly
 * empty desk rather than a crashed app, which is the right failure for a demo.
 */

import { connection } from 'next/server';

import { ledgerBackend } from '../config';
import {
  PARTY_HINTS,
  PLACEHOLDER_PARTY_IDS,
  applyPartyIds,
  type DemoRole,
} from '../parties';
import type { Party } from '../types';
import { listParties } from './json-api';

export interface ResolvedParties {
  ids: Record<DemoRole, Party>;
  /** Roles that had no party on the participant. Empty on a healthy sandbox. */
  unresolved: DemoRole[];
  source: 'mock' | 'participant';
}

const ENV_OVERRIDE: Record<DemoRole, string> = {
  treasury: 'LEDGER_PARTY_TREASURY',
  dealerA: 'LEDGER_PARTY_DEALER_A',
  dealerB: 'LEDGER_PARTY_DEALER_B',
  dealerC: 'LEDGER_PARTY_DEALER_C',
  auditor: 'LEDGER_PARTY_AUDITOR',
  registry: 'LEDGER_PARTY_REGISTRY',
};

const ROLES = Object.keys(PARTY_HINTS) as DemoRole[];

/** Re-listing parties on every render would be silly; they change rarely. */
const TTL_MS = 5_000;
let cached: { at: number; value: ResolvedParties } | null = null;

export async function resolveDemoParties(): Promise<ResolvedParties> {
  if (ledgerBackend() === 'mock') {
    return { ids: { ...PLACEHOLDER_PARTY_IDS }, unresolved: [], source: 'mock' };
  }

  // Reading the participant makes any page that renders a party id
  // request-time work. Saying so up front keeps Next from attempting to
  // prerender it and then bailing out through a thrown fetch.
  await connection();

  const fresh = cached && Date.now() - cached.at < TTL_MS && cached.value.unresolved.length === 0;
  if (fresh && cached) {
    applyPartyIds(cached.value.ids);
    return cached.value;
  }

  const ids: Record<DemoRole, Party> = { ...PLACEHOLDER_PARTY_IDS };
  const unresolved: DemoRole[] = [];

  let allocated: Party[] = [];
  try {
    allocated = (await listParties()).map((p) => p.party);
  } catch (cause) {
    console.warn('[ledger] could not list parties; falling back to placeholder ids', cause);
  }

  for (const role of ROLES) {
    const override = process.env[ENV_OVERRIDE[role]];
    if (override) {
      ids[role] = override;
      continue;
    }
    const match = pick(allocated, PARTY_HINTS[role]);
    if (match) ids[role] = match;
    else unresolved.push(role);
  }

  const value: ResolvedParties = { ids, unresolved, source: 'participant' };
  applyPartyIds(ids);
  cached = { at: Date.now(), value };
  return value;
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
