/**
 * POST a JSON body to one of this app's auth routes and normalise the answer.
 * The routes speak the same `{ error: { code, message, fields? } }` shape as the
 * ledger routes, so a form can show the server's own sentence and its per-field
 * messages without guessing.
 */

export type PostResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string; fields: Record<string, string> };

export async function postJson<T>(path: string, body: unknown): Promise<PostResult<T>> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
  } catch {
    return { ok: false, status: 0, message: 'The server did not answer. Check the connection and try again.', fields: {} };
  }

  let parsed: unknown = null;
  try {
    parsed = await response.json();
  } catch {
    /* fall through to the generic message */
  }
  if (response.ok) return { ok: true, data: parsed as T };

  const error = (parsed as { error?: { message?: unknown; fields?: unknown } } | null)?.error;
  return {
    ok: false,
    status: response.status,
    message: typeof error?.message === 'string' ? error.message : `Request failed (HTTP ${response.status}).`,
    fields:
      error?.fields && typeof error.fields === 'object' ? (error.fields as Record<string, string>) : {},
  };
}
