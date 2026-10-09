/**
 * Links from a ledger transaction to a public block explorer. SERVER ONLY.
 *
 * DevNet has one (CCView), so a settled trade's update id becomes a link there
 * by default. The sandbox and LocalNet have none: their ids are shown as plain
 * text. `LEDGER_EXPLORER_URL` overrides the default for any network (a TestNet
 * explorer, a self-hosted one), and `off` turns links off on DevNet too.
 *
 * CCView indexes what the Global Synchronizer's Scan service publishes. A
 * private transaction between two desks may not be indexed there; the link is
 * still the right place to look it up, and the id itself is always shown.
 */

const DEVNET_EXPLORER = 'https://devnet.ccview.io';

export function explorerBase(env: NodeJS.ProcessEnv = process.env): string | null {
  const configured = env.LEDGER_EXPLORER_URL?.trim();
  if (configured) {
    if (/^(off|none|false|0)$/i.test(configured)) return null;
    return validatedBase(configured);
  }
  return (env.LEDGER_NETWORK ?? 'sandbox') === 'devnet' ? DEVNET_EXPLORER : null;
}

/** `<explorer>/updates/<update id>/`, CCView's page for one transaction. */
export function explorerUrlForUpdate(updateId: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const base = explorerBase(env);
  if (!base || !updateId) return null;
  return `${base}/updates/${encodeURIComponent(updateId)}/`;
}

/**
 * A misconfigured explorer must not break settlement, so a bad value disables
 * the links rather than throwing. Only HTTPS is accepted: the link is handed to
 * every desk's browser.
 */
function validatedBase(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null;
  return url.toString().replace(/\/+$/, '');
}
