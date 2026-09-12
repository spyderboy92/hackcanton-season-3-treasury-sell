'use client';

import type { ReactNode } from 'react';

import { applyPartyIds, type DemoRole } from './parties';
import type { Party } from './types';

/**
 * Teaches the browser-side party directory the participant's real party ids.
 *
 * The ids are resolved on the server (they come from the participant, which the
 * browser may not call) and handed down as props, so both renders agree and
 * hydration stays quiet. `applyPartyIds` runs in the render body rather than in
 * an effect on purpose: React renders this component before its children, so
 * every desk below already reads the live ids on its first render instead of
 * flashing a placeholder. It is an idempotent assignment of the same values on
 * every render, which is why doing it here is safe.
 */
export function PartyBootstrap({
  ids,
  children,
}: {
  ids: Record<DemoRole, Party>;
  children: ReactNode;
}) {
  applyPartyIds(ids);
  return <>{children}</>;
}
