/**
 * Sessions: an opaque id in an HttpOnly cookie, mapped to an account in KV.
 *
 * Not a JWT. The cookie carries no claims, so nothing about the account is
 * readable client-side, and revoking a session is a KV delete rather than a
 * blocklist we would have to consult on every request.
 */
import { env } from "cloudflare:workers";

export const SESSION_COOKIE = "thi_session";
/** 30 days. Long enough that the dashboard is a habit rather than a login
 * chore, short enough that an abandoned device does not stay authorised. */
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

const PREFIX = "sess:";

export interface SessionRecord {
  accountId: string;
  createdAt: string;
}

export function newSessionId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function createSession(accountId: string): Promise<string> {
  const sid = newSessionId();
  const record: SessionRecord = { accountId, createdAt: new Date().toISOString() };
  await env.SESSION.put(PREFIX + sid, JSON.stringify(record), {
    expirationTtl: SESSION_TTL_SECONDS,
  });
  return sid;
}

export async function readSession(sid: string | undefined): Promise<SessionRecord | null> {
  if (!sid || !/^[0-9a-f]{64}$/.test(sid)) return null;
  const raw = await env.SESSION.get(PREFIX + sid);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionRecord;
  } catch {
    return null;
  }
}

export async function destroySession(sid: string | undefined): Promise<void> {
  if (sid && /^[0-9a-f]{64}$/.test(sid)) await env.SESSION.delete(PREFIX + sid);
}

export function sessionIdFromRequest(request: Request): string | undefined {
  const header = request.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE) return rest.join("=");
  }
  return undefined;
}

/**
 * Cookie flags, in one place so they cannot drift between the sign-in and
 * sign-out paths:
 *   HttpOnly  — script cannot read the session id, so an XSS bug cannot
 *               exfiltrate a login
 *   Secure    — never sent over plain HTTP
 *   SameSite=Lax — not attached to cross-site POSTs (CSRF), but still present
 *               when someone follows the emailed link, which a Strict cookie
 *               would drop on that first navigation
 *   Path=/    — the whole app
 */
export function sessionCookie(sid: string, maxAgeSeconds = SESSION_TTL_SECONDS): string {
  return [
    `${SESSION_COOKIE}=${sid}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${maxAgeSeconds}`,
  ].join("; ");
}

export function clearedSessionCookie(): string {
  return sessionCookie("", 0);
}
