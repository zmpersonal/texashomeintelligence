/**
 * Magic-link tokens.
 *
 * Passwordless by design: no password is ever chosen, transmitted or stored,
 * so there is no password hash to leak and no reset flow to attack.
 *
 * A token lives in the SESSION KV namespace with a native TTL, not in D1.
 * Expiry is then a property of the store rather than a column someone has to
 * remember to check, and an abandoned request evaporates instead of
 * accumulating as a stale row in a table of live secrets.
 *
 * Single use is enforced by deleting the key at the moment of a successful
 * read, before the account is touched. A replayed link finds nothing.
 */
import { env } from "cloudflare:workers";

/** 15 minutes. Long enough to walk to another device and open the mail,
 * short enough that a link sitting in an inbox is not a standing key. */
export const MAGIC_TOKEN_TTL_SECONDS = 15 * 60;

const PREFIX = "magic:";

export interface MagicTokenPayload {
  email: string;
  /** Consent captured at request time; the account row cannot be written
   * without it, so it travels with the token rather than being re-asked. */
  consent: true;
  consentSource: string;
  consentAt: string;
  /** Where to send the person after verifying. Path-only — see `safeNext`. */
  next?: string;
  requestedAt: string;
}

/** 32 bytes of CSPRNG, hex. Not derived from the email, so knowing an address
 * tells an attacker nothing about the token. */
export function newMagicToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function putMagicToken(token: string, payload: MagicTokenPayload): Promise<void> {
  await env.SESSION.put(PREFIX + token, JSON.stringify(payload), {
    expirationTtl: MAGIC_TOKEN_TTL_SECONDS,
  });
}

/**
 * Reads and immediately destroys the token. Returns null for unknown, expired
 * or already-used tokens — the three are deliberately indistinguishable to the
 * caller so an error message cannot confirm that a token once existed.
 */
export async function consumeMagicToken(token: string): Promise<MagicTokenPayload | null> {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const raw = await env.SESSION.get(PREFIX + token);
  if (!raw) return null;
  await env.SESSION.delete(PREFIX + token);
  try {
    return JSON.parse(raw) as MagicTokenPayload;
  } catch {
    return null;
  }
}

/**
 * Only same-site, path-only redirects survive. An open redirect on a verify
 * endpoint is a phishing primitive: the link is in an email and looks like
 * ours, so a `next` pointing off-site would borrow our credibility.
 */
export function safeNext(next: string | null | undefined): string {
  if (!next) return "/home/";
  if (!next.startsWith("/") || next.startsWith("//")) return "/home/";
  return next;
}
