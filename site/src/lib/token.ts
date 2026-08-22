/** Cryptographically random IDs, using the Web Crypto API available
 * globally in the Workers runtime — no extra dependency. */

export function newProjectId(): string {
  return crypto.randomUUID();
}

/** A long, unguessable token for the secure return link. Not a JWT and
 * not derived from the project_id — it's a separate opaque secret that
 * KV maps back to a project_id (see src/lib/kv.ts), so leaking a
 * project_id alone can't be used to resume someone else's project. */
export function newReturnToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
