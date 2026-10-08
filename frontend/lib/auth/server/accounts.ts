/**
 * Where login accounts live. SERVER ONLY.
 *
 * One interface, two stores, chosen by the same switch as the ledger client:
 *
 *   canton — the operator's `UserAccount` contracts on the participant
 *            (`TreasuryRfq.Accounts`). Lookups read the operator's ACS; a
 *            signup exercises `AccountDirectory.Register` as the operator, which
 *            claims the username and creates the account in one transaction.
 *   mock   — a process-memory map seeded with the same five demo accounts and
 *            the same hashes as `Demo.Bootstrap`, so the login flow is identical
 *            with no participant. Signups last until the server restarts.
 *
 * Only the operator is a stakeholder on a `UserAccount` (no observers, by
 * design: the bound party never needs its own credential hash), so the hash
 * never reaches any desk's ACS and never leaves this server.
 */

import { LedgerError } from '../../ledger/client';
import { ledgerBackend } from '../../ledger/config';
import type { Party } from '../../ledger/types';
import { activeContracts, exercise, ledgerEnd, submit } from '../../ledger/server/json-api';
import { resolveDemoParties, resolveOperator } from '../../ledger/server/parties';
import { isUserType, seatMatches, type AccountSeat, type SessionUser, type UserType } from '../access';

export interface StoredAccount extends SessionUser {
  passwordHash: string;
}

export interface NewAccount extends SessionUser {
  passwordHash: string;
}

export interface AccountStore {
  readonly kind: 'ledger' | 'memory';
  /** Exact match on an already-normalised username. */
  find(username: string): Promise<StoredAccount | null>;
  /** Throws `UsernameTakenError` on a duplicate. */
  register(account: NewAccount): Promise<StoredAccount>;
}

export class UsernameTakenError extends Error {
  constructor() {
    super('Username is already taken.');
    this.name = 'UsernameTakenError';
  }
}

/* ── in-memory (mock backend) ─────────────────────────────────────────── */

/**
 * Copied from `Tests.Fixtures.demoAccounts` in daml-test: scrypt(N=16384, r=8,
 * p=1, keylen=32) of password == username, salt derived from the username so
 * the seed is reproducible. Public credentials by design.
 */
const DEMO_ACCOUNTS: readonly StoredAccount[] = [
  {
    username: 'treasury',
    userType: 'Treasury',
    seat: 'treasury',
    passwordHash: 'scrypt$16384$8$1$-jvhI-OA0WlzFc33B6K6bw$rUI497KohQp-7cpG6ndxLU8_dgLaPjTfp-Eh2gCamlk',
  },
  {
    username: 'dealer-a',
    userType: 'Dealer',
    seat: 'dealerA',
    passwordHash: 'scrypt$16384$8$1$BxQBjSu4_fzKzpIf_sCOEw$5WKitPB87xb0uzO7wMz2rFnOULp0EKOFD5xYe6mQZkQ',
  },
  {
    username: 'dealer-b',
    userType: 'Dealer',
    seat: 'dealerB',
    passwordHash: 'scrypt$16384$8$1$mxcQmfG9_m4ugFbFHElrrg$PWMPqAuuJGOijXETU0bZn2ZSsh8LON1SXCL_ntnpBC4',
  },
  {
    username: 'dealer-c',
    userType: 'Dealer',
    seat: 'dealerC',
    passwordHash: 'scrypt$16384$8$1$yPvAgkfs7aQFumIDLa6jcg$jFMtKmaTXPgDBnrrZbWLRVd4bIbiQekssgLPgnAjkyM',
  },
  {
    username: 'auditor',
    userType: 'Auditor',
    seat: 'auditor',
    passwordHash: 'scrypt$16384$8$1$DLaWD-nAs8y_ifHuxuDtSA$SXwI5dsuLgqW2J2NB8v5vQtaG7PDa89jiaNBnrKsBmc',
  },
];

class MemoryAccountStore implements AccountStore {
  readonly kind = 'memory' as const;
  private readonly accounts = new Map<string, StoredAccount>(DEMO_ACCOUNTS.map((a) => [a.username, { ...a }]));

  async find(username: string): Promise<StoredAccount | null> {
    const found = this.accounts.get(username);
    return found ? { ...found } : null;
  }

  async register(account: NewAccount): Promise<StoredAccount> {
    // Check-and-set with no await in between: two signups for one name in this
    // process cannot both pass, which is the in-memory analogue of the
    // directory's contention on the ledger.
    if (this.accounts.has(account.username)) throw new UsernameTakenError();
    this.accounts.set(account.username, { ...account });
    return { ...account };
  }
}

/* ── ledger (canton backend) ──────────────────────────────────────────── */

/**
 * How many times to re-run a signup that lost a race for the directory.
 * `Register` is consuming, so every signup archives the one `AccountDirectory`;
 * two at once contend on the same contract id and the ledger rejects the
 * loser. Re-reading the directory and trying again is the protocol.
 */
const REGISTER_ATTEMPTS = 3;
const REGISTER_QUEUE_KEY = '__rfqRegisterQueue';

class LedgerAccountStore implements AccountStore {
  readonly kind = 'ledger' as const;


  async find(username: string): Promise<StoredAccount | null> {
    const operator = await requireOperator();
    const offset = await ledgerEnd();
    // The operator's whole account set, then one match by exact username. This
    // is not privacy filtering — every row is the operator's own contract —
    // just a lookup; the JSON API has no field filter on an ACS query.
    const events = await activeContracts(operator, ['UserAccount'], offset);
    for (const event of events) {
      const a = event.createArgument;
      if (a.operator !== operator || a.username !== username) continue;
      const account = decodeAccount(a);
      if (account) return account;
    }
    return null;
  }

  /**
   * Signups from THIS server process queue behind one another. Contention on
   * the directory is the ledger's guarantee and still settles races between
   * processes, but there is no point making this process's own requests fight
   * each other for the same contract id and burn their retries doing it. The
   * queue lives on `globalThis` because a store is built per request and each
   * route bundle may hold its own copy of this module.
   */
  register(account: NewAccount): Promise<StoredAccount> {
    const g = globalThis as Record<string, unknown>;
    const previous = (g[REGISTER_QUEUE_KEY] as Promise<unknown> | undefined) ?? Promise.resolve();
    const run = previous.then(() => this.registerNow(account));
    g[REGISTER_QUEUE_KEY] = run.catch(() => undefined);
    return run;
  }

  private async registerNow(account: NewAccount): Promise<StoredAccount> {
    const operator = await requireOperator();
    const { ids, unresolved } = await resolveDemoParties();
    if (unresolved.includes(account.seat)) {
      throw new LedgerError('UNAVAILABLE', 'That desk has no party on the ledger yet; try again once it is seeded.');
    }
    const party: Party = ids[account.seat];

    for (let attempt = 1; ; attempt++) {
      const directory = await readDirectory(operator);
      if (directory.usernames.includes(account.username)) throw new UsernameTakenError();
      try {
        await submit(operator, [
          exercise('AccountDirectory', directory.contractId, 'Register', {
            username: account.username,
            passwordHash: account.passwordHash,
            userType: account.userType,
            party,
            seat: account.seat,
          }),
        ]);
        return { ...account };
      } catch (cause) {
        if (cause instanceof LedgerError && /username already taken/i.test(cause.message)) {
          throw new UsernameTakenError();
        }
        // Lost the race for the directory: someone else's Register archived it
        // first. Re-read (which also catches "they took the same name") and retry.
        if (cause instanceof LedgerError && cause.code === 'CONTRACT_NOT_ACTIVE' && attempt < REGISTER_ATTEMPTS) {
          continue;
        }
        if (cause instanceof LedgerError && cause.code === 'CONTRACT_NOT_ACTIVE') {
          throw new LedgerError('CONTRACT_NOT_ACTIVE', 'Signups are busy right now; please try again.');
        }
        throw cause;
      }
    }
  }
}

async function requireOperator(): Promise<Party> {
  const operator = await resolveOperator();
  if (!operator) {
    throw new LedgerError(
      'UNAVAILABLE',
      'The ledger has no account directory (no Operator party). Re-run Demo.Bootstrap or set LEDGER_PARTY_OPERATOR.',
    );
  }
  return operator;
}

async function readDirectory(operator: Party): Promise<{ contractId: string; usernames: string[] }> {
  const offset = await ledgerEnd();
  const events = await activeContracts(operator, ['AccountDirectory'], offset);
  // One per operator by construction (Demo.Bootstrap creates it once and every
  // Register recreates it). If there were ever two, the newest is current.
  const own = events
    .filter((e) => e.createArgument.operator === operator)
    .sort((a, b) => b.offset - a.offset)[0];
  if (!own) {
    throw new LedgerError('UNAVAILABLE', 'The operator has no AccountDirectory on the ledger. Re-run Demo.Bootstrap.');
  }
  const usernames = own.createArgument.usernames;
  return {
    contractId: own.contractId,
    usernames: Array.isArray(usernames) ? usernames.filter((u): u is string => typeof u === 'string') : [],
  };
}

function decodeAccount(a: Record<string, unknown>): StoredAccount | null {
  const { username, passwordHash, userType, seat } = a;
  if (typeof username !== 'string' || typeof passwordHash !== 'string' || typeof seat !== 'string') return null;
  const type: unknown = typeof userType === 'object' && userType !== null && 'tag' in userType
    ? (userType as { tag: unknown }).tag // tolerate the `{ tag }` variant encoding as well as the bare enum string
    : userType;
  if (!isUserType(type) || !seatMatches(type, seat)) return null;
  return { username, passwordHash, userType: type as UserType, seat: seat as AccountSeat };
}

/* ── selection ────────────────────────────────────────────────────────── */

const GLOBAL_KEY = '__rfqAccountStore';

/**
 * The store for this backend. The in-memory one is parked on `globalThis` so
 * that hot reloads in `next dev` (which re-evaluate this module) do not wipe
 * signups made a moment ago.
 */
export function accountStore(): AccountStore {
  if (ledgerBackend() === 'canton') return new LedgerAccountStore();
  const g = globalThis as Record<string, unknown>;
  return ((g[GLOBAL_KEY] as AccountStore | undefined) ??= new MemoryAccountStore());
}
