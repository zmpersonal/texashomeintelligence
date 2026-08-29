/**
 * Rate limiting for link requests, in KV.
 *
 * Two independent counters. Per-address stops someone being mail-bombed by
 * repeated requests for their address; per-IP stops one client enumerating
 * many addresses. Either tripping is enough to refuse.
 *
 * The email is hashed before it becomes a key, so the rate-limit namespace is
 * not itself a browsable list of everyone who has ever tried to sign in.
 */
import { env } from "cloudflare:workers";

export const WINDOW_SECONDS = 60 * 60;
export const MAX_PER_EMAIL = 5;
export const MAX_PER_IP = 20;

async function hash(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest).slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function bump(key: string, limit: number): Promise<boolean> {
  const raw = await env.SESSION.get(key);
  const count = raw ? Number(raw) : 0;
  if (count >= limit) return false;
  // KV has no atomic increment. A racing pair of requests can both read the
  // same count, so the effective limit is approximate under concurrency —
  // acceptable for throttling mail, and noted so nobody mistakes it for a
  // guarantee. The TTL is refreshed on write, making the window rolling.
  await env.SESSION.put(key, String(count + 1), { expirationTtl: WINDOW_SECONDS });
  return true;
}

export interface RateLimitResult {
  allowed: boolean;
  reason?: "email" | "ip";
}

export async function allowLinkRequest(email: string, ip: string | null): Promise<RateLimitResult> {
  if (!(await bump(`rl:link:e:${await hash(email)}`, MAX_PER_EMAIL))) {
    return { allowed: false, reason: "email" };
  }
  if (ip && !(await bump(`rl:link:i:${await hash(ip)}`, MAX_PER_IP))) {
    return { allowed: false, reason: "ip" };
  }
  return { allowed: true };
}
