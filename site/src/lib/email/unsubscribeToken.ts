/**
 * Signed unsubscribe tokens.
 *
 * An unsubscribe link must work with one click and no login — which means the
 * link itself is the authorisation. So it cannot be a raw account id: anyone
 * who could guess or enumerate one could unsubscribe someone else, and an
 * unsubscribe URL that unsubscribes a stranger is a defect, not a nicety.
 *
 * The token is `<accountId>.<prefKey>.<HMAC-SHA256>`, signed with a Worker
 * secret. Verification recomputes the MAC and compares in constant time, so a
 * tampered id, a swapped preference key, or a token minted for a different
 * account all fail closed. Nothing is encrypted — the account id is not a
 * secret — but nothing is forgeable either, which is the property that matters.
 *
 * The signing key is `EMAIL_LINK_SIGNING_KEY`, a Worker secret. If it is absent
 * the send loop refuses to send at all rather than mailing people a link that
 * cannot work: an email without a functioning unsubscribe is worse than no
 * email. See `weeklyRun.ts`, which treats a missing key as a hard stop.
 */
import { env } from "cloudflare:workers";

export interface UnsubscribePayload {
  accountId: string;
  prefKey: string;
}

function signingKey(): string | undefined {
  return (env as unknown as Record<string, string | undefined>).EMAIL_LINK_SIGNING_KEY;
}

export function canSignLinks(): boolean {
  return Boolean(signingKey());
}

function b64url(bytes: ArrayBuffer): string {
  const bin = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function mac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return b64url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
}

/** Constant-time compare, so a wrong token cannot be narrowed by timing. */
function equal(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signUnsubscribe(payload: UnsubscribePayload): Promise<string | null> {
  const secret = signingKey();
  if (!secret) return null;
  const body = `${payload.accountId}.${payload.prefKey}`;
  return `${body}.${await mac(secret, body)}`;
}

/**
 * Returns the payload only for a token this deployment signed. Any failure —
 * malformed, unknown key, altered id, altered pref — returns null, and the
 * endpoint treats every null identically so the response cannot distinguish
 * "no such account" from "bad signature".
 */
export async function verifyUnsubscribe(token: string): Promise<UnsubscribePayload | null> {
  const secret = signingKey();
  if (!secret) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [accountId, prefKey, provided] = parts;
  if (!accountId || !prefKey || !provided) return null;

  const expected = await mac(secret, `${accountId}.${prefKey}`);
  return equal(expected, provided) ? { accountId, prefKey } : null;
}
