'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { getLedgerClient } from './index';
import type { DeskSnapshot, LedgerClient } from './client';
import { LedgerError } from './client';
import type { Party } from './types';

const LedgerContext = createContext<LedgerClient | null>(null);

export function LedgerProvider({ children }: { children: ReactNode }) {
  const client = useMemo(() => getLedgerClient(), []);
  return <LedgerContext.Provider value={client}>{children}</LedgerContext.Provider>;
}

export function useLedger(): LedgerClient {
  const client = useContext(LedgerContext);
  if (!client) throw new Error('useLedger must be used inside <LedgerProvider>');
  return client;
}

export interface DeskState {
  snapshot: DeskSnapshot | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * Everything one party can see, kept in step with the ledger. Re-reads on every
 * change the client announces, so a quote arriving on another desk lands here.
 */
export function useDesk(party: Party): DeskState {
  const client = useLedger();
  const [snapshot, setSnapshot] = useState<DeskSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);

  const refresh = useCallback(() => {
    client
      .snapshot(party)
      .then((next) => {
        if (!alive.current) return;
        setSnapshot(next);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (alive.current) setError(describe(cause));
      });
  }, [client, party]);

  useEffect(() => {
    alive.current = true;
    refresh();
    const stop = client.subscribe(refresh);
    return () => {
      alive.current = false;
      stop();
    };
  }, [client, refresh]);

  return { snapshot, loading: snapshot === null, error, refresh };
}

export interface CommandState {
  /** Key of the command currently in flight, or null. */
  pending: string | null;
  error: string | null;
  run: (key: string, command: () => Promise<unknown>) => Promise<boolean>;
  dismiss: () => void;
}

/** Runs one ledger command at a time and surfaces its rejection verbatim. */
export function useCommand(): CommandState {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (key: string, command: () => Promise<unknown>) => {
    setPending(key);
    setError(null);
    try {
      await command();
      return true;
    } catch (cause) {
      setError(describe(cause));
      return false;
    } finally {
      setPending(null);
    }
  }, []);

  const dismiss = useCallback(() => setError(null), []);
  return { pending, error, run, dismiss };
}

function describe(cause: unknown): string {
  if (cause instanceof LedgerError) return `${cause.code.replace(/_/g, ' ').toLowerCase()} — ${cause.message}`;
  if (cause instanceof Error) return cause.message;
  return 'The ledger rejected the command.';
}
