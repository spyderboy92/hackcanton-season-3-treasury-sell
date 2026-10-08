'use client';

import type { ReactNode } from 'react';

import { applyPartyDirectory, applyPartyIds, type DemoRole, type DirectoryEntry } from './parties';
import type { Party } from './types';

/**
 * Teaches the browser-side party directory the participant's real party ids,
 * and the labels/institutions from the operator's on-ledger `PartyProfile`s.
 *
 * Both are resolved on the server (they come from the participant, which the
 * browser may not call) and handed down as props, so both renders agree and
 * hydration stays quiet. The apply calls run in the render body rather than in
 * an effect on purpose: React renders this component before its children, so
 * every desk below already reads the live values on its first render instead
 * of flashing a placeholder. They are idempotent assignments of the same values
 * on every render, which is why doing it here is safe.
 *
 * The operator party itself never comes through here: it is a server-side
 * identity for reading the directory and the login accounts, not a desk.
 */
export function PartyBootstrap({
  ids,
  directory,
  children,
}: {
  ids: Record<DemoRole, Party>;
  directory: Partial<Record<DemoRole, DirectoryEntry>>;
  children: ReactNode;
}) {
  applyPartyIds(ids);
  applyPartyDirectory(directory);
  return <>{children}</>;
}
