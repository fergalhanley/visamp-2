/**
 * Which database errors are safe to show the person using the site.
 *
 * Our functions raise deliberately, with wording written to be read — "You
 * already have an artist profile." Everything else is infrastructure: a missing
 * function, a bad connection, a migration that has not been applied. Those
 * carry text like "Could not find the function ... in the schema cache", which
 * tells an artist nothing and tells an attacker a little.
 *
 * So the codes we raise with are allowed through, and nothing else is.
 */
const DELIBERATE = new Set([
  "23514", // check_violation — our own validation
  "23505", // unique_violation — already claimed
  "42501", // insufficient_privilege — not your artist
]);

export function readableRpcError(error: { code?: string; message: string }): string | null {
  return error.code && DELIBERATE.has(error.code) ? error.message : null;
}
